const { Configuration, OpenAIApi } = require('openai');
const { Client } = require('pg');

export const maxDuration = 180; // This function can run for a maximum of 5 seconds

// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la variabile d'ambiente sia impostata
});

const openai = new OpenAIApi(configuration);

// Configurazione iniziale del client PostgreSQL
let client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Se necessario per il tuo provider
  },
});

// Connessione iniziale al database
client.connect();

// Funzione per riconnettere il client in caso di errore
async function reconnectClient() {
  try {
    await client.end(); // Termina la connessione esistente
  } catch (error) {
    console.error('Errore nel terminare la connessione esistente:', error);
  }

  client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Se necessario per il tuo provider
    },
  });

  try {
    await client.connect(); // Riconnette il client
  } catch (error) {
    console.error('Errore nel riconnettere il client:', error);
    throw error;
  }
}

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
        if (error.code === 'ECONNRESET' || error.message.includes('Connection terminated unexpectedly')) {
          // La connessione è stata interrotta, prova a riconnettere
          await reconnectClient();
          // Riprova la query
          const result = await client.query(
            'INSERT INTO conversations (conversation_name) VALUES ($1) RETURNING conversation_id',
            ['Nuova Conversazione']
          );
          conversationId = result.rows[0].conversation_id;
        } else {
          console.error('Errore nella creazione della nuova conversazione:', error);
          res.status(500).json({ error: 'Errore interno del server' });
          return;
        }
      }
    }

    // Recupera la cronologia dei messaggi per la conversazione corrente
    let messages = [];
    try {
      messages = await getMessages(conversationId);
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.message.includes('Connection terminated unexpectedly')) {
        // La connessione è stata interrotta, prova a riconnettere
        await reconnectClient();
        // Riprova la funzione
        messages = await getMessages(conversationId);
      } else {
        console.error('Errore nel recupero dei messaggi:', error);
        res.status(500).json({ error: 'Errore interno del server' });
        return;
      }
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
  try {
    const res = await client.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    // Mappa i messaggi nel formato richiesto dall'API di OpenAI
    return res.rows.map((row) => ({
      role: row.role,
      content: row.content,
    }));
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.message.includes('Connection terminated unexpectedly')) {
      // La connessione è stata interrotta, prova a riconnettere
      await reconnectClient();
      // Riprova la query
      const res = await client.query(
        'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      return res.rows.map((row) => ({
        role: row.role,
        content: row.content,
      }));
    } else {
      throw error;
    }
  }
}

// Funzione per salvare un messaggio nel database
async function saveMessage(conversationId, role, content) {
  try {
    await client.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, role, content]
    );
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.message.includes('Connection terminated unexpectedly')) {
      // La connessione è stata interrotta, prova a riconnettere
      await reconnectClient();
      // Riprova la query
      await client.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, role, content]
      );
    } else {
      throw error;
    }
  }
}