<script setup>
import { pageTitle, setJsonLd, setMeta } from '../lib/head'

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL

document.title = pageTitle('הצהרת נגישות')
setMeta('description', 'הצהרת הנגישות של GushBall: התאמות הנגישות באתר, מגבלות ידועות ודרכי פנייה.')
setJsonLd(null) // drop a team page's SportsTeam block left over from SPA navigation
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="page-header">
      <div>
        <p class="eyebrow">עודכן: <time datetime="2026-10-26">26.10.2026</time></p>
        <h1 class="page-title">הצהרת נגישות</h1>
      </div>
    </header>

    <section class="space-y-3">
      <h2 class="section-title">מחויבות</h2>
      <p class="max-w-prose">
        GushBall פועל להנגשת האתר לכלל המשתמשים, כולל אנשים עם מוגבלות, בהתאם לתקן הישראלי ת״י 5568 ברמה AA
        (הנחיות WCAG 2.0 ברמה AA עם השינויים הישראליים).
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">התאמות הנגישות באתר</h2>
      <ul class="max-w-prose list-disc space-y-1 ps-5">
        <li>ניווט מלא במקלדת וקישור דילוג לתוכן.</li>
        <li>מבנה סמנטי עם היררכיית כותרות בכל עמוד.</li>
        <li>טקסט חלופי לתמונות.</li>
        <li>ניגודיות צבעים ברמה AA בתצוגה בהירה ובתצוגה כהה.</li>
        <li>תמיכה בעברית וכתיבה מימין לשמאל.</li>
        <li>כיבוד הגדרת המערכת להפחתת תנועה, כולל הפסקת מצגת התמונות בדף הבית.</li>
        <li>הגדלה עד 200% ללא אובדן תוכן או תפקוד.</li>
        <li>טפסים עם תוויות ברורות.</li>
      </ul>
      <p class="max-w-prose">האתר נבדק באמצעות בדיקות נגישות אוטומטיות; בדיקה ידנית עם קורא מסך נמצאת בתהליך.</p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">מגבלות ידועות</h2>
      <ul class="max-w-prose list-disc space-y-1 ps-5">
        <li>קובצי פלייבוק (PDF ותמונות) שקבוצות מעלות לחברי הקבוצה בלבד אינם מובטחים כנגישים.</li>
        <li>תכנים משובצים (YouTube, Facebook, Instagram, X) וקישורים לאתרים חיצוניים (איגוד הכדורסל, Google Maps) כפופים לנגישות של ספקיהם.</li>
        <li>תיאורי התמונות נקבעים לפי הכותרות שמנהלי הקבוצות מזינים.</li>
        <li>הנגישות הפיזית של האולמות והמגרשים באחריות המקום המארח.</li>
      </ul>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">דיווח על בעיית נגישות או בקשת התאמה</h2>
      <p class="max-w-prose">
        נתקלתם בבעיית נגישות, או זקוקים להתאמה? נשמח לשמוע ולטפל. אנא פרטו באיזה עמוד מדובר ומהי הבעיה.
      </p>
      <p v-if="contactEmail">
        דוא״ל: <a :href="'mailto:' + contactEmail" class="font-semibold underline"><bdi dir="ltr">{{ contactEmail }}</bdi></a>
      </p>
      <p v-else class="text-muted">כתובת לפניות בנושא נגישות תפורסם כאן בקרוב.</p>
    </section>
  </div>
</template>
