import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Building2, MessageSquare, Users, Trophy, FolderKanban, Loader2 } from 'lucide-react';
import { useTeamActivity } from '@/hooks/useTeamActivity';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Dashboard TEAM zone — visible to ALL users. Built entirely from the
 * team-readable useTeamActivity roll-up (lead_claims + profiles + campaigns).
 * No private revenue / pipeline / notes data. Styling reuses the existing
 * dashboard card gradients + accent palette so it reads as native:
 * claimed = blue (Pipeline), contacted = purple (Outreach), teammates = green
 * (Revenue).
 */
export function TeamActivity() {
  const { activity, isLoading } = useTeamActivity();
  const { totals, members, campaigns } = activity;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (totals.claimed === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center">
          <Users className="h-5 w-5 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No team activity yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Claimed businesses from everyone on the team will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Team totals — reuse the dashboard card gradient/accent tokens */}
      <div className="grid gap-3 sm:gap-4 grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
              <span className="truncate">Claimed</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-500">{totals.claimed}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Businesses claimed</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
              <span className="truncate">Contacted</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">{totals.contacted}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Marked contacted</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
              <span className="truncate">Teammates</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500">{totals.activeTeammates}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Active teammates</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {/* Per-person leaderboard */}
        <Card className="border-border">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
              <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
              <span className="truncate">Leaderboard</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-1.5">
            {members.map((m, i) => (
              <div key={m.userId} className="flex items-center gap-2.5 py-1">
                <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground/70 w-4 text-center shrink-0">
                  {i + 1}
                </span>
                <Avatar className="h-7 w-7 shrink-0">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName || 'Teammate'} />}
                  <AvatarFallback className="text-[9px] bg-primary/15 text-primary">
                    {initials(m.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">
                  {m.displayName || 'Teammate'}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-blue-500 shrink-0">{m.claimed}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">claimed</span>
                <span className="text-xs sm:text-sm font-semibold text-purple-500 shrink-0 ml-1">{m.contacted}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">contacted</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Per-campaign breakdown */}
        <Card className="border-border">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
              <FolderKanban className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
              <span className="truncate">By campaign</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-2.5">
            {campaigns.map((c) => (
              <div key={c.campaignId ?? '__none__'} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium truncate min-w-0">{c.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-semibold text-blue-500">{c.claimed}</span>
                    <span className="text-[10px] text-muted-foreground/60">claimed</span>
                    <span className="text-xs sm:text-sm font-semibold text-purple-500 ml-1">{c.contacted}</span>
                    <span className="text-[10px] text-muted-foreground/60">contacted</span>
                  </div>
                </div>
                <div className="flex items-center -space-x-1.5">
                  {c.contributors.slice(0, 6).map((p) => (
                    <Avatar key={p.userId} className="h-5 w-5 ring-1 ring-background">
                      {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.displayName || 'Teammate'} />}
                      <AvatarFallback className="text-[8px] bg-primary/15 text-primary">
                        {initials(p.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {c.contributors.length > 6 && (
                    <span className="text-[10px] text-muted-foreground/60 pl-2.5">
                      +{c.contributors.length - 6}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
