import type { Notebook } from '@/domain/planner';

const timestamp = Date.parse('2026-11-16T12:00:00+08:00');
export const samplePhotoId = '0'.repeat(64);

/** Authored demonstration content, kept separate from visitors' saved plans. */
export const showcaseNotebook: Notebook = {
  version: 1,
  trash: [],
  plans: [{
    id: 'showcase-riverside',
    title: '江边的午后',
    status: 'planned',
    date: '2026-11-16',
    location: '上海 · 黄浦江畔',
    genre: '街拍',
    intent: '沿着江岸慢慢走，记录长椅、栏杆和经过的人。\n\n等行人走进建筑之间的亮处。画面里留下水面和天空，让人物小一点。',
    notes: '35 mm 镜头，轻装出门。\n先拍沿江的线条，再找有人停留的地方。',
    schedule: [
      { id: 'walk', time: '14:30', title: '沿江散步', detail: '看栏杆、台阶和树影，找到一处能停留的机位。' },
      { id: 'people', time: '15:30', title: '等人经过', detail: '用长椅和江面组织画面，保留人物前方的空间。' },
      { id: 'evening', time: '16:20', title: '记录傍晚', detail: '回到江边，拍水面的亮部和远处建筑的层次。' },
    ],
    checklist: [
      { id: 'camera', label: '相机与 35 mm 镜头', checked: true },
      { id: 'battery', label: '充满电的备用电池', checked: true },
      { id: 'film', label: '一卷 ISO 400 胶片', checked: false },
      { id: 'cloth', label: '镜头布、饮水与薄外套', checked: false },
    ],
    photos: [{
      id: 'riverside-photo', assetId: samplePhotoId,
      name: '江岸 · 构图参考',
      caption: '保留天空与水面的留白，让人物成为画面中的一个小点。',
      annotations: [{ type: 'arrow', color: '#9c5c43', points: [{ x: 0.7, y: 0.3 }, { x: 0.55, y: 0.58 }] }],
      rotation: 0, crop: null,
    }],
    extraPages: [{ id: 'field-note', title: '拍摄笔记', text: '想留下的画面\n\n靠近江边的长椅，一双停在台阶上的鞋，树影里走过的人。\n\n同一个位置分别拍一张有人的和一张空的。回来后放在一起看看。' }],
    references: [], breaks: {}, createdAt: timestamp, updatedAt: timestamp,
  }],
};
