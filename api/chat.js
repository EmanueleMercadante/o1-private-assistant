const { Configuration, OpenAIApi } = require('openai');
const pool = require('../../lib/db.js');


// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la variabile d'ambiente sia impostata
});

const openai = new OpenAIApi(configuration);






module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { conversation_id, message, model } = req.body;
    let conversationId = conversation_id;

    // Se conversationId non è fornito, crea una nuova conversazione
    if (!conversationId) {
      try {
        const result = await pool.query(
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

    // Aggiungi il messaggio dell'utente alla cronologia (logica originale)
    // Se “message” è un array, conterrà i base64 come stringa + testo,
    // verrà inviato a OpenAI “così com’è”.
    messages.push({ role: 'user', content: message });

    // Genera la risposta utilizzando l'API di OpenAI (logica originale)
    try {
      const completion = await openai.createChatCompletion({
          model: model || 'o1-mini', // Usa il modello ricevuto o un predefinito
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

// Funzione per ottenere i messaggi di una conversazione (logica classica)
async function getMessages(conversationId) {
  const resDB = await pool.query(
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
// Se “rawContent” è un array (es: blocchi con immagini), lo salvi in content_json;
// altrimenti lo salvi come testo in content. (Esempio di ibrido)
async function saveMessage(conversationId, role, rawContent) {
  let textContent = null;
  let contentJson = null;

  if (Array.isArray(rawContent)) {
    // Se arriva un array (es. blocchi con base64, etc.), salvi nel campo content_json
    contentJson = JSON.stringify(rawContent);
    textContent = ''; // per evitare errori not-null
  } else {
    // È testo semplice
    textContent = rawContent;
  }

  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, content_json)
     VALUES ($1, $2, $3, $4)`,
    [conversationId, role, textContent, contentJson]
  );
}