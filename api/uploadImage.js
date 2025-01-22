const cloudinary = require('cloudinary').v2;
const multiparty = require('multiparty');

// Imposta i parametri (oppure in un file dedicato, se preferisci)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Errore parse form-data' });
      }
      try {
        // Leggi la stringa base64 dal field "base64"
        const base64Data = fields.base64?.[0];
        if (!base64Data) {
          return res.status(400).json({ error: 'Manca il campo base64' });
        }
        // Upload su Cloudinary come data URI
        const result = await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${base64Data}`,
          { folder: 'o1-private-imgs' }
        );
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