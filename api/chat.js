const { Client } = require('pg');
const OpenAI = require('openai');

// Inizializza il client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configurazione del client PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect();

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { conversation_id, message } = req.body;

    // Recupera la cronologia dei messaggi per la conversazione corrente
    const messages = await getMessages(conversation_id);

    // Aggiungi il messaggio dell'utente alla cronologia
    messages.push({ role: 'user', content: message });

    // Genera la risposta utilizzando l'API di OpenAI
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages
      });

      const assistantMessage = completion.choices[0].message.content;

      // Salva i messaggi nel database
      await saveMessage(conversation_id, 'user', message);
      await saveMessage(conversation_id, 'assistant', assistantMessage);

      res.status(200).json({ conversation_id, response: assistantMessage });
    } catch (error) {
      console.error('Errore nella chiamata all\'API di OpenAI:', error);
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

  // Mappa i messaggi nel formato richiesto dall'API di OpenAI
  return res.rows.map(row => ({
    role: row.role,
    content: row.content
  }));
}

// Funzione per salvare un messaggio nel database
async function saveMessage(conversationId, role, content) {
  await client.query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
    [conversationId, role, content]
  );
}