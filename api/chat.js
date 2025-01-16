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

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { conversation_id, message, model } = req.body;

    // conversation_id potrebbe essere undefined (nuova conversazione)
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
        res.status(500).json({ error: 'Errore interno del server' });
        return;
      }
    }

    // Recupera la cronologia dei messaggi per la conversazione corrente
    let messages = [];
    try {
      messages = await getMessages(conversationId);
    } catch (error) {
      console.error('Errore nel recupero dei messaggi:', error);
      res.status(500).json({ error: 'Errore interno del server' });
      return;
    }

    // Aggiungi il messaggio dell'utente
    // Il campo "message" spedito dal client può essere:
    // - una stringa semplice
    // - un array/oggetto (es. [{type:'text', text:'..'},{type:'image_url', ...}])

    // Trasformiamo in stringa per il DB
    const userContentString = typeof message === 'string' ? message : JSON.stringify(message);

    messages.push({ role: 'user', content: parseContent(message) });

    // Genera la risposta con OpenAI
    try {
      // Prima di passare a OpenAI, convertiamo i messaggi in un formato testuale.
      // Se un messaggio ha content di tipo array, estraiamo la parte testuale.
      const openAIMessages = messages.map(m => {
        return {
          role: m.role,
          content: extractTextForOpenAI(m.content)
        };
      });

      const completion = await openai.createChatCompletion({
        model: model || 'o1-mini',
        messages: openAIMessages,
      });

      const assistantMessage = completion.data.choices[0].message.content;

      // Salva i messaggi nel database
      await saveMessage(conversationId, 'user', userContentString);
      await saveMessage(conversationId, 'assistant', assistantMessage);

      res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
    } catch (error) {
      console.error(
        'Errore nella chiamata all\'API di OpenAI:',
        error.response ? error.response.data : error.message
      );
      res.status(500).json({ error: 'Errore interno del server' });
    }
  } else {
    res.status(405).json({ error: 'Metodo non consentito' });
  }
};

// Funzione per ottenere i messaggi di una conversazione
async function getMessages(conversationId) {
  const res = await client.query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );

  // Tenta di fare il parse di content come JSON, altrimenti lascia come string
  return res.rows.map((row) => {
    let parsed;
    try {
      parsed = JSON.parse(row.content);
    } catch(e) {
      parsed = row.content;
    }
    return {
      role: row.role,
      content: parseContent(parsed)
    };
  });
}

// Funzione per salvare un messaggio nel database
async function saveMessage(conversationId, role, content) {
  await client.query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
    [conversationId, role, content]
  );
}

// parseContent prende in input "parsed" che può essere string o array,
// e lo restituisce nel formato (string || array di {type, text/image_url}).
function parseContent(parsed) {
  // Se era già una stringa
  if (typeof parsed === 'string') {
    return parsed;
  }
  // Se è un array di oggetti per (testo+immagini)
  if (Array.isArray(parsed)) {
    return parsed;
  }
  // fallback
  return '';
}

// Se content è un array, estraiamo solo la parte testuale per OpenAI.
// Se content è una stringa, la usiamo così com'è.
function extractTextForOpenAI(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    // Cerchiamo l'oggetto type:'text'
    const textPart = content.find(c => c.type === 'text');
    return textPart ? textPart.text : '';
  }
  return '';
}