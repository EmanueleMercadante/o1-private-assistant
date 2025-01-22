const { Client } = require('pg');

// Configurazione del client PostgreSQL
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://default:8nCx5XIZurDd@ep-soft-tooth-a45f5lao-pooler.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require'
});

client.connect();

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        // Se viene passato un ID, ritorna la conversazione specifica
        if (req.query.id) {
            const conversationId = req.query.id;
            const messagesRes = await client.query(
              'SELECT role, content, content_json FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
              [conversationId]
            );
            res.status(200).json({ messages: messagesRes.rows });
          } else {
            // Altrimenti, ritorna tutte le conversazioni
            const conversationsRes = await client.query(
                'SELECT conversation_id, conversation_name FROM conversations ORDER BY created_at DESC'
            );
            res.status(200).json(conversationsRes.rows);
        }
    } else if (req.method === 'POST') {
        const { conversation_name } = req.body;
        const insertRes = await client.query(
            'INSERT INTO conversations (conversation_name) VALUES ($1) RETURNING conversation_id',
            [conversation_name]
        );
        const conversationId = insertRes.rows[0].conversation_id;
        res.status(201).json({ conversation_id: conversationId });
    } else if (req.method === 'DELETE') {
        const conversationId = req.query.id;
        if (!conversationId) {
            res.status(400).json({ error: 'ID conversazione mancante' });
            return;
        }

        try {
            // Elimina i messaggi associati alla conversazione
            await client.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);

            // Elimina la conversazione
            await client.query('DELETE FROM conversations WHERE conversation_id = $1', [conversationId]);

            res.status(200).json({ message: 'Conversazione eliminata con successo' });
        } catch (error) {
            console.error('Errore nell\'eliminazione della conversazione:', error);
            res.status(500).json({ error: 'Errore interno del server' });
        }
    } else {
        res.status(405).json({ error: 'Metodo non consentito' });
    }
};