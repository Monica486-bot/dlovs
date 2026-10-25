import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

export function singleFile(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err) => {
      if (!err) return next();
      if ((err as multer.MulterError).code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'The file is larger than 5 MB' });
        return;
      }
      res.status(400).json({ error: `Upload failed: ${(err as Error).message}` });
    });
  };
}
