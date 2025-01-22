const { Configuration, OpenAIApi } = require('openai');
const { Client } = require('pg');

// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la variabile d'ambiente sia impostata
});

const openai = new OpenAIApi(configuration);

// Configurazione del client PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://default:8nCx5XIZurDd@ep-soft-tooth-a45f5lao-pooler.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require'
});

client.connect();

/**
 * Helper per convertire array di blocchi (testo / immagini) in una stringa
 * per la chiamata a OpenAI.
 */
function blocksToText(blocks) {
  return blocks.map(block => {
    if (block.type === 'text') {
      return block.text;
    }
    if (block.type === 'image_url') {
      return '[immagine]';
    }
    return '';
  }).join(' ');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const { conversation_id, message, model } = req.body;
  let conversationId = conversation_id;

  // Se conversationId non è fornito, crea una nuova conversazione
  if (!conversationId) {
    try {
      const result = await client.query(
        'INSERT INTO conversations (conversation_name) VALUES ($1) RETURNING conversation_id',
        ['Nuova Conversazione']
      );
      conversationId = result.rows[0].conversation_id;
    } catch (error) {
      console.error('Errore nella creazione della nuova conversazione:', error);
      return res.status(500).json({ error: 'Errore interno del server' });
    }
  }

  // Recupera la cronologia dei messaggi per la conversazione corrente
  let messages = [];
  try {
    messages = await getMessagesForOpenAI(conversationId);
  } catch (error) {
    console.error('Errore nel recupero dei messaggi:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }

  // Prepara il testo da inviare a OpenAI
  // Se message è un array di blocchi, converti in stringa
  let userTextForOpenAI = '';
  if (Array.isArray(message)) {
    userTextForOpenAI = blocksToText(message);
  } else {
    // Altrimenti, è una stringa
    userTextForOpenAI = message || '';
  }

  // Aggiungi il messaggio dell'utente all'array che andrà a OpenAI
  messages.push({ role: 'user', content: userTextForOpenAI });

  // Salva il messaggio dell'utente nel DB (testo + JSON se presente)
  try {
    await saveMessage(conversationId, 'user', message);
  } catch (error) {
    console.error('Errore nell\'inserimento del messaggio utente:', error);
    return res.status(500).json({ error: 'Errore interno del server durante l\'inserimento' });
  }

  // Genera la risposta utilizzando l'API di OpenAI
  const usedModel = model || 'o1-mini';
  try {
    const completion = await openai.createChatCompletion({
      model: usedModel,
      messages: messages,
    });

    const assistantMessage = completion.data.choices[0].message.content;

    // Salva il messaggio dell'assistente nel DB
    try {
      await saveMessage(conversationId, 'assistant', assistantMessage);
    } catch (error) {
      console.error('Errore nell\'inserimento del messaggio assistant:', error);
      return res.status(500).json({ error: 'Errore nel salvataggio della risposta assistant' });
    }

    // Rispondi al front-end con l'ID della conversazione e la risposta
    return res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
  } catch (error) {
    console.error(
      'Errore nella chiamata all\'API di OpenAI:',
      error.response ? error.response.data : error.message
    );
    return res.status(500).json({ error: 'Errore interno del server' });
  }
};

/**
 * Recupera i messaggi da DB e li trasforma nel formato {role, content} 
 * che serve a OpenAI. Se hai introdotto la colonna content_json,
 * la useremo per generare testo quando presente.
 */
async function getMessagesForOpenAI(conversationId) {
  const queryResult = await client.query(
    `SELECT role, content, content_json
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId]
  );

  // Converte ciascun record in { role, content: '...' } per OpenAI
  return queryResult.rows.map(row => {
    if (row.content_json) {
      // Se c'è un JSON di blocchi, lo parsiamo e uniamo in testo
      const blocks = JSON.parse(row.content_json);
      const text = blocksToText(blocks);
      return { role: row.role, content: text };
    }
    // Altrimenti, usiamo content
    return { role: row.role, content: row.content || '' };
  });
}

/**
 * Salva un messaggio nel DB, gestendo la distinzione tra stringa e array di blocchi.
 * Se message è un array => content_json, se string => content, in modo da
 * non violare i vincoli NOT NULL e avere la struttura JSON disponibile.
 */
async function saveMessage(conversationId, role, rawMessage) {
  // Evitiamo errori di not-null su content
  let textContent = '';
  let contentJsonString = null;

  if (Array.isArray(rawMessage)) {
    contentJsonString = JSON.stringify(rawMessage); // Salviamo l'array in JSON
  } else {
    textContent = rawMessage || ''; // Se è stringa, la mettiamo in content
  }

  await client.query(
    `INSERT INTO messages (conversation_id, role, content, content_json)
     VALUES ($1, $2, $3, $4)`,
    [conversationId, role, textContent, contentJsonString]
  );
}