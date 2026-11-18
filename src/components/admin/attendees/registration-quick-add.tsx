"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Plus, Search, UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { localized } from "@/lib/localized";
import {
  registrationCreateSchema,
  type RegistrationCreateValues,
} from "@/lib/validation/registrations";
import { cn } from "@/lib/utils";
import { peopleSearchAction } from "@/server/actions/admin";
import { createRegistrationAction } from "@/server/actions/registrations";
import type { PersonHit } from "@/server/services/people-search";
import { Field, fieldError, useValidationMessage } from "../form-fields";
import { useActionFeedback } from "../use-action-feedback";
import type { RoleOption } from "./attendees-table";
import type { PriceOptions } from "./registration-form-dialog";

type Props = {
  eventId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  prices: PriceOptions;
  seatsFree: number;
  companies: string[];
};

/**
 * Schnell-Anmeldung (neue Oberfläche): erst Person suchen (auch aus früheren Events) und mit Enter übernehmen,
 * dann Ticket wählen statt Preis tippen; „Anlegen & nächste“ erfasst mehrere Personen am Stück.
 * Speichert über dieselbe Aktion wie der bisherige Dialog.
 */
export function RegistrationQuickAdd({
  eventId,
  open,
  onOpenChange,
  roles,
  prices,
  seatsFree,
  companies,
}: Props) {
  const t = useTranslations("registrationForm");
  const tq = useTranslations("attendees.quick");
  const locale = useLocale();
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<PersonHit | null>(null);
  const [more, setMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);

  const defaults: RegistrationCreateValues = {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    locale: "de",
    roles: ["attendee"],
    ticketType: "normal",
    priceCategoryId: "",
    price: prices.normal,
    billingCompany: "",
    billingAddress: "",
    status: seatsFree > 0 ? "confirmed" : "waitlisted",
    overbook: false,
    notify: true,
  };
  const form = useForm<RegistrationCreateValues>({
    resolver: zodResolver(registrationCreateSchema),
    defaultValues: defaults,
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = form;
  const [status, ticketType, rolesValue, priceCategoryId] = useWatch({
    control,
    name: ["status", "ticketType", "roles", "priceCategoryId"],
  });
  const categoryOptions = prices.categories.filter((c) => c.active);

  // Suche: kurz warten, dann bekannte Personen holen
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const handleId = window.setTimeout(async () => {
      const r = await peopleSearchAction({ query: q, eventId });
      if (r.ok) {
        setHits(r.data);
        setCursor(0);
      }
    }, 180);
    return () => window.clearTimeout(handleId);
  }, [query, eventId]);
  const shownHits = query.trim().length >= 2 ? hits : [];

  function startOver() {
    reset(defaults);
    setQuery("");
    setHits([]);
    setPicked(null);
    setMore(false);
    window.setTimeout(() => searchRef.current?.focus(), 30);
  }
  function close(next: boolean) {
    if (!next) startOver();
    onOpenChange(next);
  }
  function pick(p: PersonHit | null) {
    if (p) {
      setPicked(p);
      setValue("firstName", p.firstName);
      setValue("lastName", p.lastName);
      setValue("email", p.email ?? "");
      setValue("company", p.company ?? "");
      setValue("locale", p.locale);
    } else {
      // neue Person: Suchtext als Name vorbelegen („Vorname Nachname“)
      const parts = query.trim().split(/\s+/);
      setPicked(null);
      setValue(
        "firstName",
        parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
      );
      setValue(
        "lastName",
        parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? ""),
      );
      window.setTimeout(() => firstRef.current?.focus(), 30);
    }
    setHits([]);
  }
  function setTicket(next: RegistrationCreateValues["ticketType"]) {
    const first = categoryOptions[0];
    setValue("ticketType", next);
    setValue(
      "priceCategoryId",
      next === "special" && first ? String(first.id) : "",
    );
    setValue(
      "price",
      next === "special"
        ? (first?.price ?? "0,00")
        : next === "member"
          ? prices.member
          : prices.normal,
    );
  }
  function toggleRole(key: string) {
    const list = rolesValue ?? [];
    setValue(
      "roles",
      list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
      { shouldValidate: true },
    );
  }

  const submit = (andNext: boolean) =>
    handleSubmit((values) =>
      startTransition(async () => {
        const result = await createRegistrationAction(eventId, values);
        const name = `${values.firstName} ${values.lastName}`.trim();
        if (
          handle(result, {
            setError,
            success: andNext ? tq("createdNext", { name }) : t("created"),
          })
        ) {
          router.refresh();
          if (andNext) startOver();
          else close(false);
        }
      }),
    )();

  const { ref: firstRegRef, ...firstReg } = register("firstName");
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-card hover:border-primary/50",
    );
  const tile = (on: boolean) =>
    cn(
      "flex flex-col rounded-xl border px-3 py-2 text-left transition-colors",
      on
        ? "border-primary bg-brand-soft ring-1 ring-primary"
        : "border-input bg-card hover:border-primary/50",
    );

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[500px]"
      >
        <div className="border-b px-6 py-4">
          <SheetTitle className="font-display text-lg font-bold">
            {tq("title")}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {tq("hint")}
          </SheetDescription>
        </div>
        <FormProvider {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit(true);
              }
            }}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
          >
            <fieldset
              disabled={pending}
              className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
            >
              <div className="space-y-1.5">
                <label htmlFor="qa-search" className="text-sm font-semibold">
                  {tq("person")}
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="qa-search"
                    ref={searchRef}
                    autoFocus
                    autoComplete="off"
                    value={query}
                    placeholder={tq("searchPlaceholder")}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.ctrlKey || e.metaKey) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setCursor((c) => Math.min(shownHits.length, c + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setCursor((c) => Math.max(0, c - 1));
                      } else if (
                        e.key === "Enter" &&
                        query.trim().length >= 2
                      ) {
                        e.preventDefault();
                        pick(shownHits[cursor] ?? null);
                      }
                    }}
                    className="pl-9"
                    role="combobox"
                    aria-expanded={query.trim().length >= 2}
                    aria-controls="qa-hits"
                  />
                </div>
                {query.trim().length >= 2 && !picked && (
                  <ul
                    id="qa-hits"
                    role="listbox"
                    className="rounded-xl border bg-card p-1 shadow-sm"
                  >
                    {shownHits.map((p, i) => (
                      <li key={p.id} role="option" aria-selected={i === cursor}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => pick(p)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                            i === cursor && "bg-brand-soft",
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-primary"
                          >
                            {`${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {p.firstName} {p.lastName}
                              {p.registeredHere && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">
                                  {tq("alreadyRegistered")}
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[
                                p.company,
                                p.email,
                                p.events.length
                                  ? tq("wasAt", {
                                      events: p.events
                                        .map((e) =>
                                          localized(
                                            e,
                                            locale === "en" ? "en" : "de",
                                          ),
                                        )
                                        .join(", "),
                                    })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {i === cursor && (
                            <kbd className="rounded border px-1.5 font-sans text-[11px] text-muted-foreground">
                              Enter
                            </kbd>
                          )}
                        </button>
                      </li>
                    ))}
                    <li
                      role="option"
                      aria-selected={cursor === shownHits.length}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setCursor(shownHits.length)}
                        onClick={() => pick(null)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-primary",
                          cursor === shownHits.length && "bg-brand-soft",
                        )}
                      >
                        <Plus aria-hidden className="size-4" />
                        {tq("newPerson", { query: query.trim() })}
                      </button>
                    </li>
                  </ul>
                )}
                {picked && (
                  <p className="flex items-center gap-1.5 text-sm text-[#17603C]">
                    <UserCheck aria-hidden className="size-4" />
                    {tq("picked", {
                      name: `${picked.firstName} ${picked.lastName}`,
                    })}
                    {picked.registeredHere && (
                      <span className="font-semibold text-amber-800">
                        · {tq("alreadyRegistered")}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="qa-first"
                  label={t("firstName")}
                  error={fieldError(errors, "firstName")}
                >
                  <Input
                    id="qa-first"
                    autoComplete="off"
                    {...firstReg}
                    ref={(el) => {
                      firstRegRef(el);
                      firstRef.current = el;
                    }}
                  />
                </Field>
                <Field
                  id="qa-last"
                  label={t("lastName")}
                  error={fieldError(errors, "lastName")}
                >
                  <Input
                    id="qa-last"
                    autoComplete="off"
                    {...register("lastName")}
                  />
                </Field>
                <Field
                  id="qa-email"
                  label={t("email")}
                  error={fieldError(errors, "email")}
                  className="sm:col-span-2"
                >
                  <Input
                    id="qa-email"
                    type="email"
                    autoComplete="off"
                    {...register("email")}
                  />
                </Field>
                <Field
                  id="qa-company"
                  label={t("company")}
                  error={fieldError(errors, "company")}
                  className="sm:col-span-2"
                >
                  <Input
                    id="qa-company"
                    list="qa-company-list"
                    autoComplete="off"
                    {...register("company")}
                  />
                  <datalist id="qa-company-list">
                    {companies.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <fieldset className="min-w-0 space-y-1.5">
                <legend className="text-sm font-semibold">{t("roles")}</legend>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={rolesValue?.includes(r.key)}
                      onClick={() => toggleRole(r.key)}
                      className={chip(Boolean(rolesValue?.includes(r.key)))}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {fieldError(errors, "roles") && (
                  <p role="alert" className="text-xs text-destructive">
                    {message(fieldError(errors, "roles"))}
                  </p>
                )}
              </fieldset>

              <fieldset className="min-w-0 space-y-1.5">
                <legend className="text-sm font-semibold">
                  {t("ticketType")}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["normal", t("ticketNormal"), `${prices.normal} €`],
                      ["member", t("ticketMember"), `${prices.member} €`],
                      [
                        "special",
                        t("ticketSpecial"),
                        categoryOptions.length
                          ? tq("categories", { count: categoryOptions.length })
                          : tq("freeAmount"),
                      ],
                    ] as const
                  ).map(([key, label, sub]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={ticketType === key}
                      onClick={() => setTicket(key)}
                      className={tile(ticketType === key)}
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>
                {ticketType === "member" && (
                  <p className="text-xs text-muted-foreground">
                    {tq("memberHint")}
                  </p>
                )}
                {ticketType === "special" && (
                  <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    {categoryOptions.length > 0 && (
                      <Field
                        id="qa-category"
                        label={t("priceCategory")}
                        error={fieldError(errors, "priceCategoryId")}
                      >
                        <select
                          id="qa-category"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                          {...register("priceCategoryId", {
                            onChange: (e) => {
                              const c = categoryOptions.find(
                                (o) => String(o.id) === e.target.value,
                              );
                              if (c) setValue("price", c.price);
                            },
                          })}
                        >
                          {categoryOptions.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name} ({c.price} €)
                            </option>
                          ))}
                          <option value="">{t("priceCategoryOther")}</option>
                        </select>
                      </Field>
                    )}
                    <Field
                      id="qa-price"
                      label={t("price")}
                      error={fieldError(errors, "price")}
                    >
                      <Input
                        id="qa-price"
                        inputMode="decimal"
                        readOnly={Boolean(priceCategoryId)}
                        {...register("price")}
                      />
                    </Field>
                  </div>
                )}
              </fieldset>

              <fieldset className="min-w-0 space-y-1.5">
                <legend className="text-sm font-semibold">{t("status")}</legend>
                <div className="inline-flex rounded-lg border border-input p-0.5 text-sm">
                  {(["confirmed", "waitlisted"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={status === s}
                      onClick={() => setValue("status", s)}
                      className={cn(
                        "rounded-md px-3 py-1",
                        status === s
                          ? "bg-foreground font-semibold text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s === "confirmed"
                        ? t("statusConfirmed")
                        : t("statusWaitlisted")}
                    </button>
                  ))}
                </div>
                {status === "confirmed" && seatsFree <= 0 && (
                  <label className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                    <input
                      type="checkbox"
                      className="size-4"
                      {...register("overbook")}
                    />
                    {t("overbook")}
                  </label>
                )}
                <label className="flex items-start gap-2 pt-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    {...register("notify")}
                  />
                  <span>
                    {status === "waitlisted"
                      ? t("notifyWaitlisted")
                      : t("notifyConfirmed")}
                  </span>
                </label>
              </fieldset>

              <div>
                <button
                  type="button"
                  aria-expanded={more}
                  onClick={() => setMore((m) => !m)}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-4 transition-transform",
                      more && "rotate-90",
                    )}
                  />
                  {tq("more")}
                </button>
                {more && (
                  <div className="mt-3 grid gap-3">
                    <Field
                      id="qa-locale"
                      label={t("locale")}
                      hint={t("localeHint")}
                      error={fieldError(errors, "locale")}
                    >
                      <select
                        id="qa-locale"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        {...register("locale")}
                      >
                        <option value="de">{t("localeDe")}</option>
                        <option value="en">{t("localeEn")}</option>
                      </select>
                    </Field>
                    <Field
                      id="qa-billing-company"
                      label={t("billingCompany")}
                      error={fieldError(errors, "billingCompany")}
                    >
                      <Input
                        id="qa-billing-company"
                        list="qa-company-list"
                        autoComplete="off"
                        {...register("billingCompany")}
                      />
                    </Field>
                    <Field
                      id="qa-billing-address"
                      label={t("billingAddress")}
                      error={fieldError(errors, "billingAddress")}
                    >
                      <Textarea
                        id="qa-billing-address"
                        rows={3}
                        {...register("billingAddress")}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2 border-t px-6 py-3">
              <Button type="submit" disabled={pending}>
                {t("create")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void submit(true)}
              >
                {tq("createNext")}
                <kbd className="ml-1 hidden rounded border px-1.5 font-sans text-[11px] text-muted-foreground sm:inline">
                  Strg Enter
                </kbd>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() => close(false)}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
