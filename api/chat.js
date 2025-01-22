const { Configuration, OpenAIApi } = require('openai');
const { Client } = require('pg');

// Inizializza la configurazione di OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
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

    // Gestisci il caso in cui conversation_id non sia fornito (nuova conversazione)
    let conversationId = conversation_id;
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

    // Recupera la cronologia dei messaggi
    let messages = [];
    try {
      messages = await getMessages(conversationId);
    } catch (error) {
      console.error('Errore nel recupero dei messaggi:', error);
      res.status(500).json({ error: 'Errore interno del server' });
      return;
    }

    // ===============================
    // SALVATAGGIO MESSAGGIO DELL'UTENTE
    // ===============================
    // message può essere:
    //   - una stringa
    //   - un array di blocchi content JSON
    let contentText = null;
    let contentJson = null;

    if (Array.isArray(message)) {
      // Esempio: [ {type: 'text', text:'...'}, {type: 'image_url', image_url:{url:'...'}} ]
      contentJson = message;
    } else {
      // Altrimenti è semplice testo
      contentText = message;
    }

    // Salva il messaggio dell'utente nel DB
    try {
      await client.query('BEGIN');
      // usa:
      await client.query(
        `INSERT INTO messages (conversation_id, role, content, content_json)
        VALUES ($1, $2, $3, $4)`,
        [
          conversationId, 
          'user',
          contentText,
          contentJson ? JSON.stringify(contentJson) : null
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Errore nell\'inserimento del messaggio utente:', error);
      return res.status(500).json({ error: 'Errore interno del server durante l\'inserimento' });
    }

    // ===============================
    // CHIAMATA A OPENAI (o dove vuoi) PER OTTENERE RISPOSTA
    // ===============================
    // Se usi un modello custom (o1-mini, etc.), gestiscilo
    const usedModel = model || 'o1-mini';

    try {
      // Converte i messaggi per come li vuole OpenAI
      const openaiMessages = messagesToOpenAIMsg(messages);
      // Aggiunge il messaggio appena inserito
      if (contentJson) {
        // Se era un array di blocchi, uniscili in un'unica stringa 
        // (o elabora come preferisci).
        const combinedText = contentJson.map(block => {
          if (block.type === 'text') return block.text;
          if (block.type === 'image_url') return '[immagine]';
          return '';
        }).join(' ');
        openaiMessages.push({ role: 'user', content: combinedText });
      } else {
        openaiMessages.push({ role: 'user', content: contentText });
      }

      // Fai la chiamata a openai
      const completion = await openai.createChatCompletion({
        model: usedModel,
        messages: openaiMessages
      });
      const assistantMessage = completion.data.choices[0].message.content;

      // Salva la risposta dell'assistente
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO messages (conversation_id, role, content, content_json)
           VALUES ($1, $2, $3, $4)`,
          [conversationId, 'assistant', assistantMessage, null]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Errore nell\'inserimento del messaggio assistant:', error);
        return res.status(500).json({ error: 'Errore interno del server (assistant insert)' });
      }

      res.status(200).json({ conversation_id: conversationId, response: assistantMessage });

    } catch (error) {
      console.error(
        'Errore nella chiamata all\'API di OpenAI:',
        error.response ? error.response.data : error.message
      );
      res.status(500).json({ error: 'Errore interno del server - completions fail' });
    }
  } else {
    res.status(405).json({ error: 'Metodo non consentito' });
  }
};

// Recupera i messaggi di una conversazione
async function getMessages(conversationId) {
  const res = await client.query(
    `SELECT role, content, content_json
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  // Ritorna un array di oggetti: { role, content, content_json }
  return res.rows;
}

// Esempio funzione per convertire i messaggi in form compatibile con OpenAI
function messagesToOpenAIMsg(messages) {
  // Puoi adattare la logica a seconda di come gestisci content_json vs content
  return messages.map(row => {
    if (row.content_json && Array.isArray(row.content_json)) {
      // Se un messaggio è in content_json, unisciplo in una stringa 
      // (oppure potresti creare un contesto più sofisticato)
      const combinedText = row.content_json.map(block => {
        if (block.type === 'text') return block.text;
        if (block.type === 'image_url') return '[immagine]';
        return '';
      }).join(' ');
      return { role: row.role, content: combinedText };
    } else {
      // Altrimenti c'è row.content come semplice stringa
      return { role: row.role, content: row.content };
    }
  });
}