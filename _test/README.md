# `_test/` — אורקל רגרסיה headless

**לא נפרס.** התיקייה הזאת היא כלי פיתוח בלבד ואינה נכללת בחבילת השחרור
(`docs-and-tools/package-allowlist.ps1` מחריגה אותה במפורש).

## הרצה

jsdom הוא ~26MB והתיקייה מסונכרנת ב-OneDrive, ולכן הוא מותקן **מחוץ** לפרויקט
ומוצבע דרך `NODE_PATH`:

```bash
mkdir -p /tmp/lomda-test && cd /tmp/lomda-test && npm install jsdom
```

```bash
NODE_PATH=/tmp/lomda-test/node_modules node _test/verify-report.js && NODE_PATH=/tmp/lomda-test/node_modules node _test/statement-flow.js
```

⚠️ **ב-Windows, `NODE_PATH` בסגנון POSIX עובד רק כי Git Bash מתרגם אותו.** כל
דבר אחר שמפעיל node צריך נתיב Windows אמיתי, למשל
`C:/Users/<user>/AppData/Local/Temp/lomda-test/node_modules`.

שני הקבצים מקבלים נתיב אופציונלי, כדי להריץ אותם מול חבילה בנויה:

```bash
NODE_PATH=... node _test/verify-report.js ../../deployments/2026-09-19
```

## מה נבדק, ולמה דווקא זה

כל טענה כאן מתאימה לכשל **שקט** בזמן ריצה: הלומדה ממשיכה לעבוד, הלומד לא מבחין
בכלום, והנתונים פשוט שגויים או חסרים. כשלים רועשים (שאלה שמסמנת את התשובה
הלא-נכונה בירוק) נבדקים בדפדפן, לא כאן.

### `verify-report.js` — ‎367 בדיקות

| קטגוריה | מה נבדק |
|---|---|
| זהות קטלוגית | `XAPI_UNIT_ID` מול `metadata/*_unit.json`; `XAPI_COMP_ID` מול `METADATA.id`; `learningUnitId` בכל רכיב; קינון פריט/שאלה; היעדר trailing slash בשאלות |
| מפת מסכים | בדיוק `TOTAL_SCREENS` מפתחות, ‎0..N-1 בלי חורים; סיומות במרכאות; התאמה דו-כיוונית מול `metadata/` |
| חיווט השכבה | סדר תגי ה-script; `90-boot.js` אחרון ובתג נפרד; `?v=` זהה בכל הרכיבים; דיאלוגים בתוך `#app` ומחוץ ל-`.screen`; כיסוי האתחול כאח של `#app`; מזהי הדיאלוגים; נתיבים בין-רכיביים באותיות קטנות |
| CSS | קיום `‎.report-modal-overlay[hidden] { display: none }` |
| resume | ארבעת ה-hooks בכל רכיב; `repaintScreen` ו-`scheduleResumeSave` ב-`goTo`; `flushResumeSave` בכל פונקציה שמחייבת תשובה, **ולפני** ה-return המוקדם שלה; `NAV_EDGE_KEY` ו-`RESULT_KEYS` של היחידה |
| ארכיון | שסין 03 לא חזר — לא כתיקייה ולא כקובץ מטא-דאטה |
| ריצה (jsdom) | שכבת הסקריפטים רצה בלי לזרוק; `sendStatement720` לא קיים מחוץ לפלטפורמה; `xapiOnScreen` הוא no-op שקט; `xapiAnswered` עדיין רושם ציון; מעבר על כל המסכים בלי שגיאת `[resume]` |

### `statement-flow.js` — ‎52 בדיקות

מהלך על כל גבול מסך ומאמת את זוגות ה-`completed`/`initialized` מול
`SCREEN_TO_SUBCONTENT`, בלי לדעת דבר על תוכן המסכים.

⚠️ **מה הוא *לא* יכול לומר לכם.** הציפיות נגזרות מאותה מפה שהקוד קורא, ולכן
השניים מסכימים מעצם הבנייה. הוא מאמת ש-`xapiOnScreen` **מממש** את המפה — לא
שהמפה **נכונה**. מסך נרטיבי שקיבל פריט שלא מגיע לו יעבור כאן בשלום. השאלה אם
מסך ראוי לפריט היא שיפוט תוכן, ונבדקת בקריאת המסך; `verify-report.js` בודק
בנפרד את המפה מול המטא-דאטה בשני הכיוונים.

## אמינות הבדיקות

שתי החבילות נבדקו במוטציה — חבילה שלא יכולה להיכשל חסרת ערך. אומת שנתפסים:

- הסרת מפתח מ-`SCREEN_TO_SUBCONTENT` → ‎3 כשלים
- `?v=` לא תואם בין רכיבים → כשל אחד
- `learningUnitId` שגוי במטא-דאטה → כשל אחד
- הסרת `xapiOnScreen(n)` מ-`goTo` → ‎3 כשלים
- פריט שנשבר לשני רצפים לא-רציפים → כשל אחד

## `xapi-720-k.js`

עותק מקומי של ספריית ה-CDN, לבדיקות בלבד. נטען רק דרך
`?xapiLib=../_test/xapi-720-k.js` ורק ב-localhost.

⚠️ **לעולם לא להעלות אותו ל-CDN.** שם הקובץ זהה לספרייה האמיתית, והעלאה בטעות
משתיקה את כל הדיווח בשקט. `docs-and-tools/verify-package.ps1` בודק זאת.
