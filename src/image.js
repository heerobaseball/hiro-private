export function setupImage(app) {
  app.post('/api/optimize', async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!file) return c.json({ error: '画像ファイルが見つかりません' }, 400);

      // ★ ご自身のCloudinary情報を入れてください
      const CLOUD_NAME = 'ここにCloud Nameを入力'; 
      const UPLOAD_PRESET = 'ここにUpload preset nameを入力'; 

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Cloudinaryへのアップロードに失敗しました');
      }

      const data = await res.json();
      const optimizedUrl = data.secure_url.replace('/upload/', '/upload/e_improve/');
      const downloadUrl = data.secure_url.replace('/upload/', '/upload/e_improve,fl_attachment/');

      return c.json({ success: true, optimizedUrl: optimizedUrl, downloadUrl: downloadUrl });
    } catch (error) {
      return c.json({ error: error.message }, 500);
    }
  });
}