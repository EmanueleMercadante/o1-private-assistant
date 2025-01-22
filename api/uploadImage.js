const cloudinary = require('../cloudinary'); // o dove hai messo la config
const multiparty = require('multiparty');    // pacchetto per gestire form-data
// npm install multiparty

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    // Utilizziamo multiparty per estrarre il file inviato
    const form = new multiparty.Form();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Errore parse form-data' });
      }

      // Sia che arrivino base64 o un file binario, gestiamo di conseguenza
      // Esempio: se stai inviando un file binario, lo recuperi da files.myFile[0].path

      try {
        // Se stai inviando un file binario, carichi il path:
        const pathDelFile = files.fileInputName[0].path; 

        // Upload su Cloudinary
        const result = await cloudinary.uploader.upload(pathDelFile, {
          folder: 'o1-private-imgs'  // cartella facoltativa
        });

        // result.url è l’URL pubblico dell’immagine
        // Salva result.url nel DB oppure restituiscilo al front-end
        return res.status(200).json({ url: result.url });

      } catch (errUpload) {
        console.error('Errore upload su Cloudinary:', errUpload);
        return res.status(500).json({ error: 'Errore nell\'upload a Cloudinary' });
      }
    });
  } else {
    res.status(405).json({ error: 'Metodo non consentito' });
  }
};