// Field configs for TeamContentSection, shared by the admin team page and the inline editors on public pages (#468).
const POST_FIELDS = [
  { key: 'title', label: 'כותרת', type: 'text', required: true },
  { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
  { key: 'body', label: 'תוכן', type: 'textarea', required: true, maxlength: 20000, markdown: true },
  { key: 'body_en', label: 'תוכן (אנגלית)', type: 'textarea', maxlength: 20000 },
  { key: 'pinned', label: 'נעוץ', type: 'checkbox' },
]

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
  // A club's images: no player tags or home-slideshow flag (#497).
  clubImages: {
    resource: 'images',
    heading: 'תמונות',
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'url', label: 'כתובת', type: 'url', required: true, upload: true, preview: true },
    ],
  },
  posts: {
    resource: 'posts',
    heading: 'עדכונים',
    reorderable: true,
    fields: POST_FIELDS,
  },
  // A team's posts can also be tied to one of its games (#560).
  teamPosts: {
    resource: 'posts',
    heading: 'עדכונים',
    reorderable: true,
    fields: [
      ...POST_FIELDS,
      { key: 'game_id', label: 'קשור למשחק', type: 'game' },
      { key: 'image_url', label: 'תמונת רקע (לא חובה)', type: 'url', upload: true, preview: true, nullable: true },
      { key: 'expires_on', label: 'מוצג בדף הבית עד (לא חובה)', type: 'date', nullable: true },
    ],
  },
  plays: {
    resource: 'plays',
    heading: 'פלייבוק',
    reorderable: true,
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'title_en', label: 'כותרת (אנגלית)', type: 'text' },
      { key: 'notes', label: 'הערות', type: 'textarea', maxlength: 2000 },
      { key: 'file_url', label: 'קובץ: תמונה, GIF, MP4 או PDF', type: 'url', upload: true, accept: 'image/*,video/mp4,application/pdf' },
      { key: 'url', label: 'או קישור / קוד הטמעה (The Hoops Geek, FastDraw, YouTube…)', type: 'text' },
    ],
  },
}
