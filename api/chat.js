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
    const { conversation_id, message } = req.body;

    // Gestisci il caso in cui conversation_id non sia fornito (ad esempio, nuova conversazione)
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

    // Recupera la cronologia dei messaggi per la conversazione corrente
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
      const completion = await openai.createChatCompletion({
        model: 'o1-preview', // Sostituisci con il modello che preferisci
        messages: messages,
      });

      const assistantMessage = completion.data.choices[0].message.content;

      // Salva i messaggi nel database
      await saveMessage(conversationId, 'user', message);
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

  // Mappa i messaggi nel formato richiesto dall'API di OpenAI
  return res.rows.map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

// Funzione per salvare un messaggio nel database
async function saveMessage(conversationId, role, content) {
  await client.query(
    'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
    [conversationId, role, content]
  );
}