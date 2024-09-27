const { Configuration, OpenAIApi } = require('openai');
const { Client } = require('pg');

// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la variabile d'ambiente sia impostata
});

const openai = new OpenAIApi(configuration);

module.exports = async (req, res) => {
  // Creazione del client PostgreSQL all'interno della funzione handler
  const client = new Client({
    connectionString: process.env.DATABASE_URL, // Assicurati che la variabile d'ambiente sia impostata
    ssl: {
      rejectUnauthorized: false, // Se necessario per il tuo provider
    },
  });

  try {
    await client.connect();

    if (req.method === 'POST') {
      const { conversation_id, message } = req.body;

      // Gestione della conversazione
      let conversationId = conversation_id;

      if (!conversationId) {
        const result = await client.query(
          'INSERT INTO conversations (conversation_name) VALUES ($1) RETURNING conversation_id',
          ['Nuova Conversazione']
        );
        conversationId = result.rows[0].conversation_id;
      }

      // Recupera la cronologia dei messaggi
      const messages = await getMessages(client, conversationId);
      messages.push({ role: 'user', content: message });

      // Genera la risposta con OpenAI
      const completion = await openai.createChatCompletion({
        model: 'o1-preview',
        messages: messages,
      });

      const assistantMessage = completion.data.choices[0].message.content;

      // Salva i messaggi nel database
      await saveMessage(client, conversationId, 'user', message);
      await saveMessage(client, conversationId, 'assistant', assistantMessage);

      res.status(200).json({ conversation_id: conversationId, response: assistantMessage });
    } else {
      res.status(405).json({ error: 'Metodo non consentito' });
    }
  } catch (error) {
    console.error('Errore nel gestire la richiesta:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  } finally {
    await client.end();
  }
};

// Funzione per ottenere i messaggi di una conversazione
async function getMessages(client, conversationId) {
  const res = await client.query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return res.rows.map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

// Funzione per salvare un messaggio nel database
async function saveMessage(client, conversationId, role, content) {
  await client.query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
    [conversationId, role, content]
  );
}