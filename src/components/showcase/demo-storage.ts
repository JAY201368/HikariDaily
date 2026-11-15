import { showcaseNotebook, samplePhotoId } from '@/content/showcase/notebook';
import type { PlannerRuntimeStorage } from '../shooting-planner/runtime';

export function createDemoStorage(onStatus: (message: string) => void) {
  const images = new Map([[samplePhotoId, '/textures/riverside-film.webp']]);
  const notebook = structuredClone(showcaseNotebook);
  for (const plan of notebook.plans) {
    for (const photo of plan.photos) Object.assign(photo, { source: images.get(photo.assetId) });
  }
  let draft: unknown = null;
  let view: unknown = {};
  const storage: PlannerRuntimeStorage = {
    async save() { onStatus('示例编辑已保留在本次页面会话'); },
    async flush() {},
    async draft(value?: unknown) { if (value !== undefined) draft = value; return draft; },
    async view(value?: unknown) { if (value !== undefined) view = value; return view; },
    async addImage(file: File) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
        throw new Error('请选择15 MB以内的 JPEG、PNG 或 WebP 图片');
      }
      const bitmap = await createImageBitmap(file);
      const pixels = bitmap.width * bitmap.height;
      bitmap.close();
      if (pixels > 40_000_000) throw new Error('图片最多4000万像素');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const assetId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const source = images.get(assetId) ?? URL.createObjectURL(file);
      images.set(assetId, source);
      return { assetId, source };
    },
    async retryImage(id: string) {
      const source = images.get(id);
      if (!source) throw new Error('请重新选择图片');
      return source;
    },
  };
  return {
    notebook, storage,
    destroy() { for (const url of images.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url); },
  };
}
