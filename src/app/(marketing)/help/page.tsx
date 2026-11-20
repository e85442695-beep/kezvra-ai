import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/layout/prose-page";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Help Center" };

export default async function HelpPage() {
  const { locale, t } = await getDict();
  const en = locale === "en";
  const sections: [string, string][] = en
    ? [
        ["Getting started", "Create an account, confirm your email and you receive a signup bonus in credits. Open Chat, pick a model and send a message."],
        ["How credits are charged", "Before a request, the maximum possible cost is reserved from your balance. After the answer, the actual cost reported by the provider is charged and the rest is returned instantly. Bonus credits are spent before purchased ones. Every answer shows its tokens and cost."],
        ["Free models", "Models marked Free cost nothing, but have a daily request limit."],
        ["Files", "Upload PDF, DOCX, TXT, CSV, XLSX, PNG or JPG. Text is extracted automatically; large documents are split into chunks and searched by meaning. Document content is treated as data, never as instructions to the model."],
        ["Images", "Image Studio offers only the aspect ratios and image-to-image options each model actually supports. Generations run in a queue; results are stored privately."],
        ["Keyboard shortcuts", "Ctrl+K — command menu and search · Ctrl+Shift+O — new chat · / — focus the message box · Enter — send · Shift+Enter — new line · Esc — close dialogs."],
        ["Sharing chats", "From a chat's menu choose Share. You can set an expiry and rotate the link at any time; the system prompt is never shown publicly."],
        ["Your data", "Export everything from Settings → Export data. Deleting your account removes chats, files and images immediately."],
      ]
    : [
        ["Початок роботи", "Створіть акаунт, підтвердіть email — і отримаєте бонусні кредити. Відкрийте Чат, оберіть модель і надішліть повідомлення."],
        ["Як списуються кредити", "Перед запитом із балансу резервується максимально можлива вартість. Після відповіді списується фактична вартість від провайдера, а решта миттєво повертається. Спершу витрачаються бонусні кредити, потім куплені. Під кожною відповіддю видно токени й вартість."],
        ["Безкоштовні моделі", "Моделі з позначкою «Безкоштовно» нічого не коштують, але мають денний ліміт запитів."],
        ["Файли", "Завантажуйте PDF, DOCX, TXT, CSV, XLSX, PNG або JPG. Текст витягується автоматично; великі документи діляться на фрагменти й шукаються за змістом. Вміст документів сприймається як дані, а не як інструкції для моделі."],
        ["Зображення", "Image Studio показує лише ті співвідношення сторін і режим image-to-image, які справді підтримує модель. Генерації виконуються в черзі, результати зберігаються приватно."],
        ["Гарячі клавіші", "Ctrl+K — командне меню й пошук · Ctrl+Shift+O — новий чат · / — фокус на полі вводу · Enter — надіслати · Shift+Enter — новий рядок · Esc — закрити діалог."],
        ["Поширення чатів", "У меню чату оберіть «Поділитися». Можна задати термін дії й будь-коли замінити посилання; системний промпт публічно не показується."],
        ["Ваші дані", "Експорт усіх даних — у Налаштуваннях. Видалення акаунта одразу стирає чати, файли й зображення."],
      ];
  return (
    <ProsePage title={t.nav.help}>
      {sections.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
      <h2>{t.nav.support}</h2>
      <p>
        {en ? "Didn't find an answer? " : "Не знайшли відповідь? "}
        <Link href="/support">{en ? "Open a support request" : "Створіть звернення до підтримки"}</Link>.
      </p>
    </ProsePage>
  );
}
