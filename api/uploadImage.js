const cloudinary = require('cloudinary');
const multiparty = require('multiparty');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const form = new multiparty.Form();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Errore parse form-data' });
      }

      try {
        /*
         Se stai inviando il base64 come fields.base64 (stringa base64):
           es: formData.append('base64', laTuaStringBase64);
         
         Altrimenti se stai ancora inviando un file binario,
         gestisci files.fileInputName[0].path come prima.
        */
        const base64Data = fields.base64?.[0]; 
        if (!base64Data) {
          return res.status(400).json({ error: 'Manca il campo base64' });
        }

        // Carica su Cloudinary (puoi aggiungere "data:image/jpeg;base64," prima di base64Data)
        const result = await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${base64Data}`,
          { folder: 'o1-private-imgs' }
        );
        
        // Restituisco l’URL ottenuto
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