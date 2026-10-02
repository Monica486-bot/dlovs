const multer = require('multer');

// FR10 / NFR10: one file, up to 5 MB, kept in memory until it is encrypted.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Wraps multer so its errors come back as readable 400s instead of 500s.
function singleFile(field) {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'The file is larger than 5 MB' });
      return res.status(400).json({ error: `Upload failed: ${err.message}` });
    });
  };
}

module.exports = { singleFile };
