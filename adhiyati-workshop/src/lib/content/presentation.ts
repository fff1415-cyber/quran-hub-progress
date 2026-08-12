/**
 * محتوى العرض التقديمي — نص حرفي من ملف PDF
 * يُمنع تعديل أو حذف أي كلمة أو حرف أو رقم
 */

export const WORKSHOP_TITLE = "ورشة مشروع أضحيتي";
export const WORKSHOP_YEAR = "1447";

export const CHALLENGE_TOPICS = [
  { id: 1, title: "استقطاب المضحني", subtitle: "والوصول إىل عدد أكرب من المضحني" },
  { id: 2, title: "التسويق والرشاكات", subtitle: "" },
  { id: 3, title: "تجربة المتجر", subtitle: "والتوكيل والدفع" },
  { id: 4, title: "التواصل والطمأنينة", subtitle: "للمضحي" },
  { id: 5, title: "الجاهزية التشغيلية والتوس\tع", subtitle: "إىل\t500\t+" },
  { id: 6, title: "التوزيع وتجربة المستفي\tد", subtitle: "" },
  { id: 7, title: "الحفظ والتخزين وسلسل\tة", subtitle: "التوزيع" },
  { id: 8, title: "التقنية واألتمتة والبيا\tنات", subtitle: "" },
  { id: 9, title: "نموذج أضحييت القادم", subtitle: "والتوسع" },
] as const;

export const DIRECTIONAL_CHALLENGES = [
  "استقطاب المضحني والوصول إىل عدد أكرب من المضحني",
  "التسويق والرشاكات",
] as const;

export type SlideType =
  | "cover" | "section" | "project-intro" | "project-definition"
  | "project-goals" | "target-audience" | "journey-section" | "journey-map"
  | "what-happened" | "challenges" | "challenge-topics" | "improvements"
  | "documentation" | "closing";

export interface Slide {
  id: number;
  type: SlideType;
  title?: string;
  content?: string | string[];
  sections?: { heading: string; body: string | string[] }[];
}

export const PRESENTATION_SLIDES: Slide[] = [
  { id: 1, type: "cover", title: "ور\tشة مرشوع إضحييت", content: "لعام\t1447" },
  { id: 2, type: "section", title: "ورشة زكاة الفطر" },
  { id: 3, type: "project-intro", title: "ما هو مرشوع\tأضحييت", content: "تعريف المرشوع\nالفئة المستهدفة\nاألهداف" },
  { id: 4, type: "project-definition", title: "تعريف المرشوع", content: "مرشوع أضحييت مرشوع موسمي سنوي تنفذه جمعية الزاد لتيسري أداء شعرية األضحية عرب جهة موثوقة، من التوكيل والتنفيذ إىل التوزيع والتوثيق، بما يحقق طمأنينة المضحي وأثرًا مجتمعيًا مستدامًا، مستندًا إىل خربة تمتد ألكرث من\t15\tعامًا\t." },
  { id: 5, type: "project-goals", title: "أهداف ال\tمرشوع", content: ["1\t-\tتوزيع األضاحي عىل األرس المستحقة يف الوقت المحدد\t.", "2\t-\tتحقيق التكافل المجتمعي وتعزيز أثر المرشوع عىل األرس المستفي\tدة\t.", "3\t-توفري تجربة موثوقة وشفافة للمضحي من خالل التتبع اإللكرتوين لمراحل التنفيذ\t."] },
  { id: 6, type: "target-audience", title: "الفئة المستهدفة", sections: [
    { heading: "المضحون والموكلون", body: "األفراد الراغبون يف أداء األضحية عرب الجمعية، خصوصًا الباحثون عن السهولة والموثوقية والطمأنينة، بما يشمل المغرتبني والمنشغلني، مع توفري التوكيل والدفع والمتابعة والت\tوثيق\t." },
    { heading: "األرس المستفيدة", body: "األرس المستحقة للحوم األضاحي، ومن أبرز معايري االستحقاق\t:\tانخفاض الدخل عن الحد المانع المعتمد، ووجود األرسة ضمن قوائم الجمعية المحدثة، مع التحقق االجتماعي ودراسة الحاالت الطارئة\t." },
  ]},
  { id: 7, type: "journey-section", title: "رحلـــة ورشة زكاة الفطر" },
  { id: 8, type: "journey-map", title: "رحلــــــــــــــــــــــــــــــة", content: "زكــــــــــــــــــــــــــــــــاة الفطـــــــــــــــــــــــــــر", sections: [{ heading: "مراحل التنفيذ", body: ["التوكيل والدف\tع", "التحقق من الطلب", "تعيني األضحية", "النقل المربد", "السلخ والتجه\tزي", "الذبح الرشعي", "اإلغـــــــــــــــــــــــــالق", "الفحص البيطري والرشعي", "التوزيع الميداين", "التقطيع والتعب\tئة"] }] },
  { id: 9, type: "what-happened", title: "ماذا\tحدث\tفعلي\tا" },
  { id: 10, type: "challenges", title: "التحديات" },
  { id: 11, type: "challenge-topics", title: "مواضيع التحديات" },
  { id: 12, type: "improvements", title: "فرص التحسني" },
  { id: 13, type: "documentation", title: "التـــــــــــــــــدوين", content: "والتقيــــــــــــــيم" },
  { id: 14, type: "closing", title: "نشكر حضوركم الكريم\tوتفاعلكم", content: "فجمعيتكم بكم تواصل مسيرة\tالتميز\tوالعطاء" },
];

export const WORKSHOP_STAGES = [
  { id: 1, key: "registration", label: "تسجيل الفرق" },
  { id: 2, key: "topic-reservation", label: "حجز المحاور" },
  { id: 3, key: "brainstorming", label: "العصف والصياغة" },
  { id: 4, key: "prioritization", label: "ترتيب الأولوية" },
  { id: 5, key: "live-voting", label: "التصويت المباشر" },
  { id: 6, key: "improvements", label: "فرص التحسين" },
  { id: 7, key: "final-report", label: "التقرير الختامي" },
] as const;

export type WorkshopStageKey = (typeof WORKSHOP_STAGES)[number]["key"];
