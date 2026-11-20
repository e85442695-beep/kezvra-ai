import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDraftNotice, ProsePage } from "@/components/layout/prose-page";
import { getDict } from "@/lib/i18n/server";

const DOCS = ["terms", "privacy", "cookies"] as const;
type Doc = (typeof DOCS)[number];

export function generateStaticParams() {
  return DOCS.map((doc) => ({ doc }));
}

const titles: Record<Doc, { uk: string; en: string }> = {
  terms: { uk: "Умови використання", en: "Terms of Service" },
  privacy: { uk: "Політика конфіденційності", en: "Privacy Policy" },
  cookies: { uk: "Політика cookies", en: "Cookie Policy" },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return DOCS.includes(doc as Doc) ? { title: titles[doc as Doc].en } : { title: "Not found" };
}

/** [square brackets] mark values the operator must fill in. */
const content: Record<Doc, { uk: [string, string][]; en: [string, string][] }> = {
  terms: {
    uk: [
      ["1. Сервіс", "Kezvra AI надає доступ до AI-моделей сторонніх провайдерів через OpenRouter. Оператор сервісу: [юридична особа], [адреса], [реєстраційний номер]."],
      ["2. Акаунт", "Вам має бути щонайменше [16] років. Ви відповідаєте за збереження пароля й за дії у вашому акаунті."],
      ["3. Кредити", "Kezvra Credits — внутрішня одиниця оплати, не є грошима чи електронними грошима, не підлягає обміну на гроші та передачі. Вартість запиту розраховується з фактичної ціни провайдера за курсом, вказаним на сайті. Куплені кредити не мають терміну дії, якщо інше не вказано під час покупки."],
      ["4. Оплата й повернення", "Платежі обробляє [Stripe / інший провайдер]. Повернення коштів можливе протягом [14] днів за невикористані куплені кредити; при поверненні відповідна кількість кредитів анулюється. Бонусні кредити поверненню не підлягають."],
      ["5. Допустиме використання", "Заборонено використовувати сервіс для незаконної діяльності, створення шкідливого ПЗ, обходу обмежень провайдерів моделей, автоматизованого обходу лімітів або перепродажу доступу без згоди оператора."],
      ["6. Відповіді AI", "Відповіді моделей можуть бути неточними. Не використовуйте їх як професійну медичну, юридичну чи фінансову консультацію."],
      ["7. Обмеження відповідальності", "Сервіс надається «як є». Відповідальність оператора обмежена сумою, сплаченою вами за останні [12] місяців."],
      ["8. Застосовне право", "Ці умови регулюються правом [юрисдикція]. Контакт: [email]."],
    ],
    en: [
      ["1. Service", "Kezvra AI provides access to third-party AI models via OpenRouter. Operator: [legal entity], [address], [registration number]."],
      ["2. Account", "You must be at least [16] years old. You are responsible for keeping your password safe and for activity in your account."],
      ["3. Credits", "Kezvra Credits are an internal billing unit; they are not money or e-money, cannot be exchanged for money and are not transferable. Request cost is calculated from the provider's actual price at the rate shown on the site. Purchased credits do not expire unless stated at purchase."],
      ["4. Payments and refunds", "Payments are processed by [Stripe / other provider]. Refunds for unused purchased credits are available within [14] days; the corresponding credits are revoked. Bonus credits are not refundable."],
      ["5. Acceptable use", "You may not use the service for unlawful activity, malware creation, circumventing model providers' policies, automated limit evasion, or reselling access without the operator's consent."],
      ["6. AI output", "Model output may be inaccurate. Do not rely on it as professional medical, legal or financial advice."],
      ["7. Limitation of liability", "The service is provided as is. The operator's liability is limited to the amount you paid in the last [12] months."],
      ["8. Governing law", "These terms are governed by the laws of [jurisdiction]. Contact: [email]."],
    ],
  },
  privacy: {
    uk: [
      ["Які дані ми збираємо", "Email, ім'я, хеш пароля (Argon2id), IP і user-agent сесій, ваші чати, завантажені файли, згенеровані зображення, історія платежів (без даних картки — їх обробляє платіжний провайдер)."],
      ["Навіщо", "Для надання сервісу, білінгу, безпеки (захист від зловживань) і підтримки. Ми не продаємо дані й не навчаємо моделі на них."],
      ["Кому передаємо", "Текст запитів і вкладення передаються обраному провайдеру моделі через OpenRouter лише для отримання відповіді. Платіжні дані — платіжному провайдеру. Файли зберігаються в [S3-сумісне сховище, регіон]."],
      ["Зберігання", "Чати й файли — доки ви їх не видалите. Після видалення акаунта вміст стирається одразу, а фінансові записи анонімізуються через 30 днів і зберігаються стільки, скільки вимагає закон. Логи помилок — 90 днів."],
      ["Ваші права", "Доступ, експорт (Налаштування → Експорт даних), виправлення, видалення, заперечення проти обробки. Контакт: [email DPO]."],
    ],
    en: [
      ["What we collect", "Email, name, password hash (Argon2id), session IP and user-agent, your chats, uploaded files, generated images, payment history (no card data — the payment provider handles it)."],
      ["Why", "To provide the service, billing, security (abuse prevention) and support. We do not sell data or train models on it."],
      ["Who receives it", "Prompt text and attachments go to the model provider you choose, via OpenRouter, only to produce the answer. Payment data goes to the payment provider. Files are stored in [S3-compatible storage, region]."],
      ["Retention", "Chats and files until you delete them. On account deletion content is erased immediately; financial records are anonymized after 30 days and kept as long as the law requires. Error logs: 90 days."],
      ["Your rights", "Access, export (Settings → Export data), correction, deletion, objection. Contact: [DPO email]."],
    ],
  },
  cookies: {
    uk: [
      ["Які cookies ми використовуємо", "Лише необхідні: cookie сесії входу (authjs.session-token), мова (kz-locale), позначка про ознайомлення з цим повідомленням (kz-cookies). Тема зберігається в localStorage."],
      ["Аналітика й реклама", "Не використовуються. Якщо це зміниться, ми попросимо вашої згоди заздалегідь."],
    ],
    en: [
      ["Cookies we use", "Strictly necessary only: the sign-in session cookie (authjs.session-token), language (kz-locale) and a flag that you've seen this notice (kz-cookies). Theme is stored in localStorage."],
      ["Analytics and ads", "None. If that changes, we will ask for your consent first."],
    ],
  },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!DOCS.includes(doc as Doc)) notFound();
  const d = doc as Doc;
  const { locale } = await getDict();
  const en = locale === "en";
  return (
    <ProsePage title={titles[d][en ? "en" : "uk"]} updated={en ? "Draft · 2026-11-20" : "Чернетка · 2026-11-20"}>
      <LegalDraftNotice en={en} />
      {content[d][en ? "en" : "uk"].map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </ProsePage>
  );
}
