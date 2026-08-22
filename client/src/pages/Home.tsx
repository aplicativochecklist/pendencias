/*
 * Oficina Editorial: painel operacional de pendências, com hierarquia suíça,
 * azul de manutenção #155E75, alerta laranja reservado e leitura rápida.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Check, ChevronDown, CircleHelp, ClipboardList, Copy, Database, Filter, Loader2, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, UserRound, Wrench } from "lucide-react";
import tools from "@/data/tools.json";

type Tool = { item: number; code: string; description: string; quantity: number };
type RecordRow = { code: string; date: string; technician: string; branch: string; checklistType: string; itemType: string; item: string; quantity: number };
type ApiPayload = { rows?: unknown[]; data?: unknown[]; registros?: unknown[] };

const DATA_ENDPOINT = "https://script.google.com/macros/s/AKfycbxF2vJtwdl2At0VQcao-nOLz2I8iiaRpKF8MbeHoiqoQJnDEoA12LINpxKNazlLTLLPXQ/exec";
const standardTools = tools as Tool[];

const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
const firstOf = (row: Record<string, unknown>, names: string[]) => {
  const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [key(k), v]));
  for (const name of names) if (normalized[key(name)] !== undefined) return normalized[key(name)];
  return "";
};

function normalizeRow(row: unknown): RecordRow | null {
  if (Array.isArray(row)) {
    const [code, date, technician, , branch, checklistType, itemType, item, quantity] = row;
    return { code: clean(code), date: clean(date), technician: clean(technician), branch: clean(branch), checklistType: clean(checklistType), itemType: clean(itemType), item: clean(item), quantity: Number(quantity || 0) };
  }
  if (!row || typeof row !== "object") return null;
  const object = row as Record<string, unknown>;
  const item = clean(firstOf(object, ["Item", "Descrição", "Descricao", "Ferramenta"]));
  if (!item) return null;
  return {
    code: clean(firstOf(object, ["Código Checklist", "Codigo Checklist", "Código", "Codigo"])),
    date: clean(firstOf(object, ["Data do Checklist", "Data/Hora", "Data Hora", "Data"])),
    technician: clean(firstOf(object, ["Técnico", "Tecnico", "Nome do técnico", "Nome do tecnico"])),
    branch: clean(firstOf(object, ["Filial", "Unidade"])),
    checklistType: clean(firstOf(object, ["Tipo de Checklist", "Tipo Checklist"])),
    itemType: clean(firstOf(object, ["Tipo de Item", "Tipo"])),
    item,
    quantity: Number(firstOf(object, ["Quantidade", "Qtd"]) || 0),
  };
}

const parseDate = (value: string) => {
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`).getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function Home() {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [technician, setTechnician] = useState("");
  const [branch, setBranch] = useState("");
  const [checklistType, setChecklistType] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const loadRows = async () => {
    setLoading(true); setApiError("");
    try {
      const response = await fetch(DATA_ENDPOINT, { method: "GET", cache: "no-store" });
      const text = await response.text();
      let payload: ApiPayload;
      try { payload = JSON.parse(text) as ApiPayload; } catch { throw new Error("A API atual respondeu apenas OK. Ela precisa fornecer os registros da aba RespostasItens em JSON."); }
      const rawRows = payload.rows || payload.data || payload.registros || [];
      const normalized = rawRows.map(normalizeRow).filter(Boolean) as RecordRow[];
      setRows(normalized);
      if (!normalized.length) setApiError("Nenhum registro retornado pela aba RespostasItens.");
    } catch (error) {
      setRows([]);
      setApiError(error instanceof Error ? error.message : "Não foi possível consultar a planilha.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadRows(); }, []);

  const technicians = useMemo(() => Array.from(new Set(rows.map((row) => row.technician).filter(Boolean))).sort(), [rows]);
  const branches = useMemo(() => Array.from(new Set(rows.map((row) => row.branch).filter(Boolean))).sort(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map((row) => row.checklistType).filter(Boolean))).sort(), [rows]);

  const latestRows = useMemo(() => {
    const filtered = rows.filter((row) => (!technician || row.technician === technician) && (!branch || row.branch === branch) && (!checklistType || row.checklistType === checklistType));
    if (!technician || !branch) return [];
    const latestDate = Math.max(...filtered.map((row) => parseDate(row.date)));
    return filtered.filter((row) => parseDate(row.date) === latestDate);
  }, [rows, technician, branch, checklistType]);

  const present = useMemo(() => new Map(latestRows.map((row) => [key(row.item), row])), [latestRows]);
  const pending = useMemo(() => standardTools.filter((tool) => !present.has(key(tool.description)) || (present.get(key(tool.description))?.quantity || 0) < tool.quantity), [present]);
  const coveredCount = standardTools.length - pending.length;
  const visiblePending = pending.filter((tool) => !search || key(tool.description).includes(key(search)) || tool.code.includes(search));
  const latestDate = latestRows.length ? latestRows.reduce((latest, row) => parseDate(row.date) > parseDate(latest.date) ? row : latest, latestRows[0]).date : "—";
  const selectedContext = technician && branch ? `${technician} · ${branch}` : "Selecione técnico e filial";

  const copyList = async () => {
    await navigator.clipboard?.writeText(visiblePending.map((tool) => `${tool.description} — ${tool.quantity} un.`).join("\n"));
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#18323b] selection:bg-[#b8dce5]">
      <header className="relative overflow-hidden border-b border-[#d7e0dc] bg-[#f6f4ef]">
        <div className="absolute inset-0 bg-[url('/manus-storage/atelier-panel-bg_39ee919e.jpg')] bg-cover bg-center opacity-35" />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-10 pt-5 sm:px-8 lg:px-12">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3"><img src="/manus-storage/pendencias-mark_7f802181.png" className="h-10 w-10" alt="Marca de pendências" /><div><p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#50717a]">Controle operacional</p><p className="font-display text-lg font-bold tracking-tight text-[#173b46]">Ferramental Técnico</p></div></div>
            <div className="hidden items-center gap-2 rounded-full border border-[#cadbd8] bg-white/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#54747b] sm:flex"><Database size={14} /> RespostasItens</div>
          </nav>
          <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div><p className="mb-4 font-mono text-xs uppercase tracking-[0.28em] text-[#df7339]">Lista de pendências</p><h1 className="max-w-3xl font-display text-4xl font-bold leading-[0.98] tracking-[-0.05em] text-[#153d49] sm:text-6xl">Ferramentas Pendentes</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#557179]">Cruze a conferência mais recente com o ferramental padrão e transforme ausência em uma ação objetiva de reposição.</p></div>
            <div className="border-l-2 border-[#df7339] pl-5"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#66838a]">Regra ativa</p><p className="mt-2 font-display text-xl font-semibold leading-tight text-[#244a55]">Última conferência por técnico, filial e tipo.</p><p className="mt-2 text-sm text-[#6b858a]">A data mais recente define o retrato consultado.</p></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
        <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-[#d4dfdc] bg-[#eef4f1] p-5 shadow-[0_20px_60px_rgba(31,74,83,0.06)]">
            <div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#66838a]">01 / Contexto</p><h2 className="mt-2 font-display text-2xl font-bold text-[#173e49]">Selecione o recorte</h2></div><SlidersHorizontal size={19} className="text-[#df7339]" /></div>
            <div className="space-y-4">
              <SelectField label="Nome do técnico" icon={<UserRound size={15} />} value={technician} onChange={setTechnician} options={technicians} placeholder="Escolha um técnico" disabled={!technicians.length} />
              <SelectField label="Filial" icon={<ClipboardList size={15} />} value={branch} onChange={setBranch} options={branches} placeholder="Escolha a filial" disabled={!branches.length} />
              <SelectField label="Tipo de checklist" icon={<Filter size={15} />} value={checklistType} onChange={setChecklistType} options={types} placeholder="Todos os tipos" disabled={!types.length} allowEmpty />
            </div>
            <div className="mt-7 border-t border-[#d3e0dc] pt-5"><div className="flex items-center gap-2 text-xs font-semibold text-[#496b73]"><CalendarDays size={15} /> Última leitura</div><p className="mt-2 font-mono text-sm text-[#173e49]">{latestDate}</p><p className="mt-1 text-xs leading-5 text-[#719097]">Apenas a conferência mais recente entra no cálculo.</p></div>
            <button onClick={() => void loadRows()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#b9d0cc] bg-white px-4 py-3 text-sm font-semibold text-[#245765] transition hover:-translate-y-0.5 hover:border-[#155e75] active:scale-[0.98]"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar fonte</button>
          </aside>

          <div className="min-w-0">
            {apiError && <div className="mb-5 grid grid-cols-[38px_1fr] overflow-hidden rounded-2xl border border-[#f1c8ad] bg-[#fff6ef] text-sm text-[#8d4e2e]"><div className="flex items-center justify-center border-r border-[#f1c8ad] bg-[#ffeadc] font-mono text-xs font-bold text-[#c65f2d]">00</div><div className="flex items-start gap-3 p-4"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Nota de configuração da fonte</p><p className="mt-1 leading-6">{apiError} A página aguarda um retorno JSON da aba `RespostasItens`; nenhum dado operacional é inventado localmente.</p></div></div></div>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Ferramentas padrão" value={standardTools.length} tone="ink" icon={<Wrench size={17} />} />
              <Metric label="Conferidas" value={technician && branch ? coveredCount : "—"} tone="green" icon={<ShieldCheck size={17} />} />
              <Metric label="Pendências" value={technician && branch ? pending.length : "—"} tone="orange" icon={<AlertCircle size={17} />} />
            </div>

            <div className="mt-8 rounded-2xl border border-[#d7e1de] bg-white shadow-[0_20px_70px_rgba(31,74,83,0.07)]">
              <div className="flex flex-col gap-4 border-b border-[#e2e9e6] p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#df7339]">02 / Resultado</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#173e49]">Pendências de ferramental</h2><p className="mt-1 text-sm text-[#749096]">{selectedContext}</p></div><div className="flex gap-2"><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[#8aa2a5]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar item..." className="h-10 w-full rounded-xl border border-[#d5e0dd] bg-[#fbfcfa] pl-9 pr-3 text-sm outline-none transition focus:border-[#4c8791] focus:ring-2 focus:ring-[#b8dce5] sm:w-52" /></div><button onClick={() => void copyList()} disabled={!visiblePending.length} className="flex h-10 items-center gap-2 rounded-xl border border-[#d5e0dd] px-3 text-xs font-semibold text-[#386772] transition hover:border-[#4c8791] disabled:cursor-not-allowed disabled:opacity-40"><Copy size={15} /> {copied ? "Copiado" : "Copiar"}</button></div></div>
              {loading ? <EmptyState icon={<Loader2 size={22} className="animate-spin" />} title="Aguardando leitura da fonte" body="A consulta operacional está verificando a aba RespostasItens. Nenhum resultado será presumido enquanto a fonte não responder." number="00" /> : !technician || !branch ? <EmptyState icon={<Settings2 size={22} />} title="Defina técnico e filial" body="Escolha o contexto da conferência para calcular a lista de pendências com segurança." number="01" /> : !visiblePending.length ? <EmptyState icon={<Check size={24} />} title="Nenhuma pendência encontrada" body="Neste recorte, o ferramental padrão está completo ou nenhum item corresponde à busca." success number="OK" /> : <div className="relative divide-y divide-[#e7eeeb] border-l-2 border-[#dbe8e4]">{visiblePending.map((tool, index) => <div key={tool.code || tool.description} className="group relative flex items-center gap-4 px-5 py-4 transition hover:bg-[#f8fbf9]" style={{ animationDelay: `${Math.min(index * 24, 240)}ms` }}><div className="absolute -left-[9px] h-4 w-4 rounded-full border-4 border-white bg-[#df7339]" /><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0e7] font-mono text-xs font-bold text-[#bf5e2e]">{String(tool.item).padStart(2, "0")}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#294f59]">{tool.description}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8aa0a3]">Ref. {tool.code || "sem código"}</p></div><div className="text-right"><p className="font-display text-lg font-bold text-[#c65f2d]">{tool.quantity}</p><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#91a4a6]">faltante</p></div></div>)}</div>}
              <div className="border-t border-[#e2e9e6] bg-[#fbfcfa] px-5 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#87a0a3]">Fonte: RespostasItens · Lista padrão: FerramentasPadrãoTécnico.xlsx · {standardTools.length} itens de referência</p></div>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between px-5 pb-8 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#91a5a7] sm:px-8 lg:px-12"><span>Oficina editorial / v1</span><span className="hidden sm:block">Leitura operacional · sem alterações na fonte</span></footer>
    </div>
  );
}

function SelectField({ label, icon, value, onChange, options, placeholder, disabled, allowEmpty }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; options: string[]; placeholder: string; disabled?: boolean; allowEmpty?: boolean }) {
  return <label className="block"><span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#658289]">{icon}{label}</span><div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-11 w-full appearance-none rounded-xl border border-[#cbdcd8] bg-white px-3 pr-9 text-sm text-[#244c56] outline-none transition focus:border-[#4c8791] focus:ring-2 focus:ring-[#b8dce5] disabled:cursor-not-allowed disabled:bg-[#f2f6f4] disabled:text-[#9aabaa]"><option value="">{placeholder}</option>{allowEmpty && !value ? null : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[#789398]" /></div></label>;
}

function Metric({ label, value, tone, icon }: { label: string; value: number | string; tone: "ink" | "green" | "orange"; icon: React.ReactNode }) {
  const colors = { ink: "text-[#155e75] bg-[#e7f2f2]", green: "text-[#36725e] bg-[#e8f3ec]", orange: "text-[#c65f2d] bg-[#fff0e7]" };
  return <div className="rounded-2xl border border-[#d7e1de] bg-white p-5 shadow-[0_10px_35px_rgba(31,74,83,0.04)]"><div className={`mb-5 flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}>{icon}</div><p className="font-display text-3xl font-bold tracking-tight text-[#173e49]">{value}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#7d969a]">{label}</p></div>;
}

function EmptyState({ icon, title, body, success, number = "01" }: { icon: React.ReactNode; title: string; body: string; success?: boolean; number?: string }) {
  return <div className="relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden px-8 text-center"><div className="absolute left-8 top-8 bottom-8 w-px bg-[#dbe8e4] sm:left-12" /><div className="absolute left-[27px] top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-[#f1f7f4] font-mono text-[10px] font-bold text-[#6d9094] sm:left-[43px]">{number}</div><div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${success ? "bg-[#e8f3ec] text-[#36725e]" : "bg-[#e7f2f2] text-[#155e75]"}`}>{icon}</div><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8aa0a3]">registro operacional</p><h3 className="mt-2 font-display text-xl font-bold text-[#244c56]">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#7a9397]">{body}</p></div>;
}
