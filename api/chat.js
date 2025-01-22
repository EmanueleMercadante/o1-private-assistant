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
    || 'postgres://default:8nCx5XIZurDd@ep-soft-tooth-a45f5lao-pooler.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require'
});

client.connect();

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { conversation_id, message, model } = req.body;
    let conversationId = conversation_id;

    // Se conversationId non è fornito, crea una nuova conversazione
    if (!conversationId) {
      try {
        const result = await client.query(
          'INSERT INTO conversations (conversation_name) VALUES ($1) RETURNING conversation_id',
          ['Nuova Conversazione'] // Puoi personalizzare il nome della conversazione
        );
        conversationId = result.rows[0].conversation_id;
      } catch (error) {
        console.error('Errore nella creazione della nuova conversazione:', error);
        res.status(500).json({ error: 'Errore interno del server' });
        return;
      }
    }

    // Recupera la cronologia esistente
    let messages = [];
    try {
      messages = await getMessages(conversationId);
    } catch (error) {
      console.error('Errore nel recupero dei messaggi:', error);
      res.status(500).json({ error: 'Errore interno del server' });
      return;
    }

    // Aggiungi il messaggio dell'utente alla cronologia
    messages.push({ role: 'user', content: message });

    // Genera la risposta utilizzando l'API di OpenAI
    try {
      // Primo tentativo
      const completion = await openai.createChatCompletion({
        model: model || 'o1-mini',
        messages: messages,
      });

      const assistantMessage = completion.data.choices[0].message.content;

      // Salva i messaggi nel database
      await saveMessage(conversationId, 'user', message);
      await saveMessage(conversationId, 'assistant', assistantMessage);

      res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
    } catch (error) {
      console.error('Errore nella chiamata all\'API di OpenAI (primo tentativo):', error);
      // Secondo tentativo di retry
      try {
        const completionRetry = await openai.createChatCompletion({
          model: model || 'o1-mini',
          messages: messages,
        });

        const assistantMessageRetry = completionRetry.data.choices[0].message.content;

        // Salva i messaggi nel database
        await saveMessage(conversationId, 'user', message);
        await saveMessage(conversationId, 'assistant', assistantMessageRetry);

        res.status(200).json({ conversation_id: conversationId, response: assistantMessageRetry });
      } catch (error2) {
        console.error('Errore nella chiamata all\'API di OpenAI (secondo tentativo):', error2);
        // Dopo due fallimenti, ritorna errore 500
        res.status(500).json({ error: 'Errore interno del server dopo 2 tentativi' });
      }
    }
  } else {
    res.status(405).json({ error: 'Metodo non consentito' });
  }
};

// Funzione per ottenere i messaggi di una conversazione
async function getMessages(conversationId) {
  const resDB = await client.query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );

  // Mappa i messaggi nel formato richiesto dall'API di OpenAI
  return resDB.rows.map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

// Funzione per salvare un messaggio nel database
// Se “rawContent” è un array (es. blocchi con immagini), lo salvi in content_json;
// altrimenti lo salvi come testo in content.
async function saveMessage(conversationId, role, rawContent) {
  let textContent = null;
  let contentJson = null;

  if (Array.isArray(rawContent)) {
    contentJson = JSON.stringify(rawContent);
    textContent = ''; // per evitare errori not-null
  } else {
    textContent = rawContent;
  }

  await client.query(
    `INSERT INTO messages (conversation_id, role, content, content_json)
     VALUES ($1, $2, $3, $4)`,
    [conversationId, role, textContent, contentJson]
  );
}