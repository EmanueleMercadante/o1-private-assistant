const { Configuration, OpenAIApi } = require('openai');
const { Client } = require('pg');

// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la variabile d'ambiente sia impostata
});
const openai = new OpenAIApi(configuration);

// Configurazione del client PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL 
    || 'postgres://default:xxx@host:5432/verceldb?sslmode=require'
});
client.connect();

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

  // Recupera la cronologia
  let messages = [];
  try {
    messages = await getMessages(conversationId);
  } catch (error) {
    console.error('Errore nel recupero dei messaggi:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }

  // Aggiungi il messaggio dell’utente alla cronologia
  messages.push({ role: 'user', content: message });

  // Inserisci subito il messaggio dell’utente nel DB
  try {
    await saveMessage(conversationId, 'user', message);
  } catch (err) {
    console.error('Errore salvataggio messaggio utente:', err);
    return res.status(500).json({ error: 'Errore interno del server (saveMessage user)' });
  }

  // Tenta la prima volta la chiamata a OpenAI
  let assistantMessage;
  try {
    assistantMessage = await doOpenAIRequest(model, messages);
  } catch (err) {
    console.error('Prima chiamata a OpenAI fallita, ritento...', err);
    // Retry singolo
    try {
      assistantMessage = await doOpenAIRequest(model, messages);
    } catch (err2) {
      console.error('Seconda chiamata a OpenAI fallita:', err2);
      return res.status(500).json({ error: 'Errore interno del server dopo 2 tentativi' });
    }
  }

  // Salva il messaggio dell’assistente nel DB
  try {
    await saveMessage(conversationId, 'assistant', assistantMessage);
  } catch (error) {
    console.error('Errore salvataggio messaggio assistant:', error);
    return res.status(500).json({ error: 'Errore interno del server (saveMessage assistant)' });
  }

  // Tutto ok
  return res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
};

// Funzione di comodo per fare la request a OpenAI
async function doOpenAIRequest(model, messages) {
  const usedModel = model || 'o1-mini';
  const completion = await openai.createChatCompletion({
    model: usedModel,
    messages: messages
  });
  return completion.data.choices[0].message.content;
}

// Ottiene i messaggi (cronologia) da DB
async function getMessages(conversationId) {
  const resDB = await client.query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return resDB.rows.map((row) => ({ role: row.role, content: row.content }));
}

// Salva un singolo messaggio nel DB
async function saveMessage(conversationId, role, rawContent) {
  let textContent = null;
  let contentJson = null;

  if (Array.isArray(rawContent)) {
    contentJson = JSON.stringify(rawContent);
    textContent = ''; 
  } else {
    textContent = rawContent;
  }

  await client.query(
    `INSERT INTO messages (conversation_id, role, content, content_json)
     VALUES ($1, $2, $3, $4)`,
    [conversationId, role, textContent, contentJson]
  );
}