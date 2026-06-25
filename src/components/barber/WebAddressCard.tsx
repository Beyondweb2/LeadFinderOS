import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Copy, ExternalLink, Globe, Lock } from "lucide-react";
import { ROOT_DOMAIN, subdomainUrl, validateSubdomain } from "@/lib/subdomain";
import type { OwnedSite } from "@/components/barber/BarberShell";

/**
 * "Your web address" — a paid barber picks <label>.yoursites.uk and it goes live
 * in seconds (SSL is automatic; the connect-subdomain function creates the DNS
 * record). is_paid-gated, exactly like the booking setup: unpaid barbers see a
 * locked card with an upgrade CTA. The edge function is the authoritative check —
 * the inline availability lookup is just instant feedback.
 */
export function WebAddressCard({
  site,
  locked,
  onUpgrade,
  onConnected,
}: {
  site: OwnedSite;
  locked: boolean;
  onUpgrade: () => void;
  onConnected: (subdomain: string) => void;
}) {
  const { toast } = useToast();
  const current = (site.subdomain ?? "").toLowerCase();

  const [editing, setEditing] = useState(!current);
  const [value, setValue] = useState(current);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = value.trim().toLowerCase();
  const validation = validateSubdomain(label);
  const isCurrent = label === current && !!current;

  // Debounced availability check (best-effort; the function decides for real).
  useEffect(() => {
    setAvailable(null);
    if (!editing || isCurrent || !validation.ok) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setChecking(true);
      const { data } = await (supabase as unknown as SupabaseClient)
        .from("generated_sites")
        .select("id")
        .ilike("subdomain", label)
        .neq("id", site.id)
        .maybeSingle();
      setAvailable(!data);
      setChecking(false);
    }, 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, editing, isCurrent, validation.ok]);

  const handleSave = async () => {
    if (!validation.ok) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("connect-subdomain", {
        body: { siteId: site.id, subdomain: label },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string; subdomain?: string };
      if (!res?.ok) {
        const map: Record<string, string> = {
          taken: "That address is already taken — try another.",
          not_paid: "Custom web addresses are a paid feature.",
          reserved: "That name is reserved — pick another.",
          invalid_format: "Use lowercase letters, numbers and hyphens only.",
          invalid_length: "Use between 3 and 63 characters.",
          dns_failed: "Couldn't set that up just now — please try again.",
          pages_failed: "Couldn't set that up just now — please try again.",
          save_failed: "Couldn't save — please try again.",
        };
        toast({ title: "Couldn't connect", description: map[res?.error ?? ""] ?? "Please try again.", variant: "destructive" });
        return;
      }
      onConnected(res.subdomain ?? label);
      setEditing(false);
      toast({ title: "Your web address is live 🎉", description: `${res.subdomain}.${ROOT_DOMAIN}` });
    } catch (e) {
      toast({ title: "Couldn't connect", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subdomainUrl(current));
      toast({ title: "Copied", description: subdomainUrl(current) });
    } catch { /* clipboard blocked — non-fatal */ }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber" /> Your web address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get your own web address like <span className="font-medium text-zinc-200">yourname.{ROOT_DOMAIN}</span> — part of the paid plan, with secure HTTPS and live in seconds.
            </p>
            <Button onClick={onUpgrade} className="rounded-full">
              <Lock className="h-4 w-4 mr-2" /> Unlock
            </Button>
          </div>
        ) : !editing && current ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Your site is live at:</p>
            <a href={subdomainUrl(current)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-sm text-amber-soft hover:text-amber break-all">
              {current}.{ROOT_DOMAIN} <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copy} className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white">
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setValue(current); setEditing(true); }} className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white">
                Change address
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Pick your web address. It’s live in seconds with secure HTTPS — nothing to set up.</p>
            <div className="flex items-center gap-2">
              <Input
                value={value}
                autoFocus
                placeholder="yourname"
                onChange={(e) => setValue(e.target.value.toLowerCase())}
                className="max-w-[200px]"
              />
              <span className="font-mono text-sm text-muted-foreground">.{ROOT_DOMAIN}</span>
            </div>

            {/* Validation / availability feedback */}
            {label && !validation.ok && <p className="text-xs text-destructive">{validation.error}</p>}
            {label && validation.ok && isCurrent && <p className="text-xs text-muted-foreground">This is your current address.</p>}
            {label && validation.ok && !isCurrent && (
              <p className="text-xs">
                {checking ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>
                ) : available === true ? (
                  <span className="text-green-500 inline-flex items-center gap-1"><Check className="h-3 w-3" /> {label}.{ROOT_DOMAIN} is available</span>
                ) : available === false ? (
                  <span className="text-destructive">That address is taken — try another.</span>
                ) : null}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || !validation.ok || isCurrent || available === false || checking}
                className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                {saving ? "Setting up…" : "Make it live"}
              </Button>
              {current && (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setValue(current); }} className="rounded-full text-muted-foreground">
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
