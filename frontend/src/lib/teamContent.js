// Field configs for TeamContentSection, shared by the admin team page and the inline editors on public pages (#468).
export const CONTENT_SECTIONS = {
  links: {
    resource: 'links',
    heading: 'קישורים',
    fields: [
      { key: 'label', label: 'תווית', type: 'text', required: true },
      { key: 'label_en', label: 'תווית (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true },
    ],
  },
  videos: {
    resource: 'videos',
    heading: 'סרטונים',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
    ],
  },
  images: {
    resource: 'images',
    heading: 'תמונות',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true, upload: true, preview: true },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
      { key: 'hidden_from_home', label: 'הסתרה מתצוגת דף הבית', type: 'checkbox' },
    ],
  },
  posts: {
    resource: 'posts',
    heading: 'עדכונים',
    reorderable: true,
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'body', label: 'תוכן', type: 'textarea', required: true },
      { key: 'body_en', label: 'תוכן (אנגלית)', type: 'textarea' },
      { key: 'pinned', label: 'נעוץ', type: 'checkbox' },
    ],
  },
  plays: {
    resource: 'plays',
    heading: 'פלייבוק',
    reorderable: true,
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'notes', label: 'הערות', type: 'textarea' },
      { key: 'file_url', label: 'קובץ: תמונה, GIF, MP4 או PDF', type: 'url', upload: true, accept: 'image/*,video/mp4,application/pdf' },
      { key: 'url', label: 'או קישור חיצוני (FastDraw, YouTube…)', type: 'url' },
    ],
  },
}
