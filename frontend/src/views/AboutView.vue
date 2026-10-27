<script setup>
import { pageTitle, setJsonLd, setMeta } from '../lib/head'

const contactEmail = import.meta.env.VITE_CONTACT_EMAIL

document.title = pageTitle('אודות')
setMeta('description', 'GushBall: אתר כדורסל לכל קבוצה בליגות איגוד הכדורסל: משחקים, תוצאות, טבלה ושחקנים. מי אנחנו, מאיפה הנתונים ואיך יוצרים קשר.')
setJsonLd(null) // drop a team page's SportsTeam block left over from SPA navigation
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="page-header">
      <div>
        <p class="eyebrow">GushBall</p>
        <h1 class="page-title">אודות</h1>
      </div>
    </header>

    <section class="space-y-3">
      <h2 class="section-title">מה זה GushBall</h2>
      <p class="max-w-prose">
        GushBall הוא אתר כדורסל לכל קבוצה בליגות איגוד הכדורסל, לא רק למועדון אחד. אפשר למצוא בו את לוח המשחקים
        והתוצאות, טבלת הליגה, הסגל, עדכונים, תמונות וסרטונים. לא צריך להירשם כדי לצפות, והקבוצה שבחרתם נשמרת בדפדפן שלכם בלבד.
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">מאיפה הנתונים</h2>
      <p class="max-w-prose">
        לוח המשחקים, התוצאות, הטבלאות, סגלי השחקנים ולוגואי היריבות נמשכים אוטומטית מאתר איגוד הכדורסל
        (<bdi dir="ltr">ibasketball.co.il</bdi>) ומתעדכנים מדי לילה. התוצאות אינן מתעדכנות בזמן אמת.
        תכני הקבוצה (שחקנים, תמונות ועדכונים) מנוהלים על ידי מנהלי המועדון והקבוצה, ועריכה ידנית שלהם גוברת על העדכון האוטומטי.
      </p>
      <p class="max-w-prose">GushBall אינו אתר רשמי של איגוד הכדורסל.</p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">לשחקנים</h2>
      <p class="max-w-prose">
        שחקנים יכולים ליצור חשבון (עם Google או עם דוא״ל וסיסמה) ולבקש להצטרף לקבוצה שלהם. מנהל הקבוצה מאשר את הבקשה,
        וחברים מאושרים מקבלים גישה לדף הסטטיסטיקות.
      </p>
      <p>
        <RouterLink :to="{ name: 'join' }" class="font-semibold underline">בקשת הצטרפות לקבוצה</RouterLink>
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">הקבוצה שלכם לא באתר?</h2>
      <p class="max-w-prose">
        חפשו את הליגה שלכם תחת
        <RouterLink :to="{ name: 'teams' }" class="font-semibold underline">כל הקבוצות</RouterLink>.
        קבוצה שעדיין לא באתר אפשר לבקש מדף הליגה שלה.
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">צרו קשר</h2>
      <p class="max-w-prose">שאלות, תיקונים או רצון להוסיף קבוצה? נשמח לשמוע.</p>
      <p v-if="contactEmail">
        דוא״ל: <a :href="'mailto:' + contactEmail" class="font-semibold underline"><bdi dir="ltr">{{ contactEmail }}</bdi></a>
      </p>
      <p v-else class="text-muted">כתובת ליצירת קשר תפורסם כאן בקרוב.</p>
    </section>
  </div>
</template>
