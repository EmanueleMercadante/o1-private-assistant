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
 * Converte un array di “blocchi” (testo / immagini) in una stringa da passare a OpenAI.
 * Esempio: [ {type:"text", text:"ciao"}, {type:"image_url", ...} ] => "ciao [immagine]"
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
        ['Nuova Conversazione'] // Nome predefinito
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
    messages = await getMessages(conversationId);
  } catch (error) {
    console.error('Errore nel recupero dei messaggi:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }

  // --------------------------------------------
  // Prepara il messaggio utente per OpenAI
  // --------------------------------------------
  let userTextForOpenAI = '';
  if (Array.isArray(message)) {
    // Se “message” è un array di blocchi => convertili in stringa
    userTextForOpenAI = blocksToText(message);
  } else {
    // Altrimenti è una stringa
    userTextForOpenAI = message || '';
  }

  // Aggiungi il messaggio dell'utente alla cronologia (in formato OpenAI)
  messages.push({ role: 'user', content: userTextForOpenAI });

  // Salva il messaggio dell’utente nel DB (testo o JSON)
  try {
    await saveMessage(conversationId, 'user', message);
  } catch (error) {
    console.error('Errore nell\'inserimento del messaggio utente:', error);
    return res.status(500).json({ error: 'Errore interno del server durante l\'inserimento' });
  }

  // -------------------------------------------------------
  // Chiamata a OpenAI
  // -------------------------------------------------------
  try {
    const completion = await openai.createChatCompletion({
      model: model || 'o1-mini',  // Modello di default
      messages: messages,
    });

    const assistantMessage = completion.data.choices[0].message.content;

    // Salva la risposta dell’assistente
    try {
      await saveMessage(conversationId, 'assistant', assistantMessage);
    } catch (error) {
      console.error('Errore nell\'inserimento del messaggio assistant:', error);
      return res.status(500).json({ error: 'Errore nel salvataggio della risposta assistant' });
    }

    // Rispondi con conversation_id e la risposta
    return res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
  } catch (error) {
    console.error(
      'Errore nella chiamata all\'API di OpenAI:',
      error.response ? error.response.data : error.message
    );
    return res.status(500).json({ error: 'Errore interno del server' });
  }
};

// ─────────────────────────────────────────────────────
// Funzione per ottenere i messaggi di una conversazione
// Restituisce un array di { role, content } per OpenAI
// ─────────────────────────────────────────────────────
async function getMessages(conversationId) {
  const resDB = await client.query(
    'SELECT role, content, content_json FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );

  // Converti i record in { role, content } come richiesto da OpenAI
  // Se content_json non è null, trasformalo in stringa con blocksToText
  return resDB.rows.map(row => {
    if (row.content_json) {
      try {
        const blocks = JSON.parse(row.content_json);
        const text = blocksToText(blocks);
        return { role: row.role, content: text };
      } catch {
        // In caso di JSON malformato, fallback a content
        return { role: row.role, content: row.content };
      }
    }
    return { role: row.role, content: row.content };
  });
}

// ─────────────────────────────────────────────────────
// Funzione per salvare il messaggio (string vs array)
// ─────────────────────────────────────────────────────
async function saveMessage(conversationId, role, rawMessage) {
  // Se rawMessage è array => lo salviamo in JSON
  // Altrimenti come stringa in “content”
  let textContent = '';
  let contentJsonString = null;

  if (Array.isArray(rawMessage)) {
    contentJsonString = JSON.stringify(rawMessage);
  } else {
    textContent = rawMessage || '';
  }

  await client.query(
    'INSERT INTO messages (conversation_id, role, content, content_json) VALUES ($1, $2, $3, $4)',
    [conversationId, role, textContent, contentJsonString]
  );
}