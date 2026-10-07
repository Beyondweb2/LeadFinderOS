import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useTemplates } from '@/hooks/useTemplates';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { MINE_HEADING, TEAM_HEADING, TEAM_MARK, canManageTemplate, isTeamTemplate } from '@/lib/teamTemplates';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { DialogHero, EmptyState, LoadState, PageHeader } from '@/components/operator/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Plus,
  Copy,
  Pencil,
  Trash2,
  MessageSquare,
  Mic,
  Archive,
  ArchiveRestore,
  CopyPlus,
  Users,
  X
} from 'lucide-react';
import type { Template, TemplateType, TemplateCategory } from '@/types/outreach';
import { TEMPLATE_CATEGORY_OPTIONS } from '@/types/outreach';

const Templates = () => {
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    copyToClipboard,
    grouped,
    archivedTeam,
    duplicateToMine,
  } = useTemplates();
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const who = { isAdmin, userId: user?.id };

  const [activeTab, setActiveTab] = useState<TemplateType>('text');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'other' as TemplateCategory,
    /** Admin only: who can use a NEW template. Salespeople only ever make their own. */
    scope: 'personal' as 'personal' | 'team',
  });

  const textTemplates = templates.filter((t) => t.template_type === 'text');
  const voiceTemplates = templates.filter((t) => t.template_type === 'voice_script');
  const teamOf = (type: TemplateType) => grouped.team.filter((t) => t.template_type === type);
  const mineOf = (type: TemplateType) => grouped.mine.filter((t) => t.template_type === type);

  const openCreateDialog = (type: TemplateType) => {
    setEditingTemplate(null);
    setFormData({ title: '', content: '', category: 'other', scope: 'personal' });
    setActiveTab(type);
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      title: template.title,
      content: template.content,
      category: template.category,
      scope: template.scope === 'team' ? 'team' : 'personal',
    });
    setIsDialogOpen(true);
  };

  const openViewDialog = (template: Template) => {
    setViewingTemplate(template);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;

    if (editingTemplate) {
      /* Only the words and the category change here; who can use it is changed by Share with team / Move to mine below. */
      await updateTemplate(editingTemplate.id, { title: formData.title, content: formData.content, category: formData.category });
    } else {
      await createTemplate({
        template_type: activeTab,
        category: formData.category,
        title: formData.title,
        content: formData.content,
        scope: isAdmin ? formData.scope : 'personal',
      });
    }

    setIsDialogOpen(false);
    setFormData({ title: '', content: '', category: 'other', scope: 'personal' });
    setEditingTemplate(null);
  };

  const handleDelete = async (t: Template) => {
    const msg = isTeamTemplate(t) ? 'Delete this Team template for everyone? Archive it instead to hide it but keep it.' : 'Are you sure you want to delete this template?';
    if (confirm(msg)) await deleteTemplate(t.id);
  };

  const TemplateCard = ({ template, onClick }: { template: Template; onClick: () => void }) => {
    const team = isTeamTemplate(template);
    const manage = canManageTemplate(template, who);
    return (
    <Card
      className="bg-card/50 border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
      data-testid={team ? 'team-template-card' : 'my-template-card'}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-1.5 text-base">
              {template.title}
              {team && <span className="rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-yellow-600 ring-1 ring-inset ring-yellow-500/40 dark:text-yellow-300" data-testid="team-mark">{TEAM_MARK}</span>}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {TEMPLATE_CATEGORY_OPTIONS.find((c) => c.value === template.category)?.label || template.category}
            </CardDescription>
          </div>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Copy"
              onClick={() => copyToClipboard(template.content, template.title)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {team && !manage && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Save as my template" data-testid="save-as-mine" onClick={() => void duplicateToMine(template)}>
                <CopyPlus className="h-4 w-4" />
              </Button>
            )}
            {isAdmin && !team && manage && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Share with the team" data-testid="share-with-team" onClick={() => void updateTemplate(template.id, { scope: 'team' })}>
                <Users className="h-4 w-4" />
              </Button>
            )}
            {manage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Edit"
                onClick={() => openEditDialog(template)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {manage && team && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive (hide from the team, keep it)" data-testid="archive-team" onClick={() => void updateTemplate(template.id, { archived_at: new Date().toISOString() })}>
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {manage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                title="Delete"
                onClick={() => handleDelete(template)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
          {template.content}
        </p>
      </CardContent>
    </Card>
    );
  };

  /** One tab's list: TEAM TEMPLATES first, then MY TEMPLATES (a heading is shown only when there is something to tell apart). */
  const Sections = ({ type, cols }: { type: TemplateType; cols: string }) => {
    const team = teamOf(type);
    const mine = mineOf(type);
    const heading = (label: string, n: number) => <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label} <span className="font-normal">· {n}</span></p>;
    return (
      <div className="space-y-6">
        {team.length > 0 && (
          <section data-testid="team-templates">
            {heading(TEAM_HEADING, team.length)}
            <div className={cols}>{team.map((t) => <TemplateCard key={t.id} template={t} onClick={() => openViewDialog(t)} />)}</div>
          </section>
        )}
        {(mine.length > 0 || team.length === 0) && (
          <section data-testid="my-templates">
            {team.length > 0 && heading(MINE_HEADING, mine.length)}
            {mine.length === 0 ? (
              <EmptyState icon={type === 'text' ? MessageSquare : Mic} tone="blue" title={type === 'text' ? 'No text templates yet' : 'No voice scripts yet'}
                action={<Button onClick={() => openCreateDialog(type)}><Plus className="h-4 w-4 mr-2" />{type === 'text' ? 'Create First Template' : 'Create First Script'}</Button>}>
                {type === 'text' ? 'Create templates for your initial texts and follow-ups.' : 'Create scripts for your voice note pitches.'}
              </EmptyState>
            ) : (
              <div className={cols}>{mine.map((t) => <TemplateCard key={t.id} template={t} onClick={() => openViewDialog(t)} />)}</div>
            )}
          </section>
        )}
        {isAdmin && archivedTeam.filter((t) => t.template_type === type).length > 0 && (
          <details data-testid="archived-team">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Archived team templates · {archivedTeam.filter((t) => t.template_type === type).length}</summary>
            <div className="mt-2 space-y-2">
              {archivedTeam.filter((t) => t.template_type === type).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void updateTemplate(t.id, { archived_at: null })}><ArchiveRestore className="h-3.5 w-3.5" />Restore</Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <LoadState label="Loading templates…" className="h-full py-16" />
    );
  }

  return (
    <div className="space-y-6">
      <SEOHead title="Outreach Templates | LeadFinder Pro" description="Manage text and voice note templates for client outreach." noindex />
      <PageHeader icon={FileText} tone="blue" title="Templates" subtitle="Team templates from Findable, and your own text messages and voice note scripts" />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateType)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="text" className="gap-2 flex-1 sm:flex-initial">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden xs:inline">Text Messages</span>
              <span className="xs:hidden">Texts</span> ({textTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="voice_script" className="gap-2 flex-1 sm:flex-initial">
              <Mic className="h-4 w-4" />
              <span className="hidden xs:inline">Voice Scripts</span>
              <span className="xs:hidden">Voice</span> ({voiceTemplates.length})
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => openCreateDialog(activeTab)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Template
          </Button>
        </div>

        <TabsContent value="text" className="mt-6">
          <Sections type="text" cols="grid gap-4 md:grid-cols-2 lg:grid-cols-3" />
        </TabsContent>

        <TabsContent value="voice_script" className="mt-6">
          <Sections type="voice_script" cols="grid gap-4 md:grid-cols-2" />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHero
            icon={activeTab === 'text' ? MessageSquare : Mic}
            tone="blue"
            title={editingTemplate ? 'Edit Template' : 'Create Template'}
            subtitle={activeTab === 'text'
              ? 'Create a text message template for quick copying.'
              : 'Create a voice note script to guide your pitches.'}
          />
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Initial Text, Follow-up, No Website Pitch"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            {isAdmin && !editingTemplate && (
              <div className="space-y-2">
                <Label htmlFor="scope">Who can use it?</Label>
                <Select value={formData.scope} onValueChange={(v) => setFormData({ ...formData, scope: v as 'personal' | 'team' })}>
                  <SelectTrigger id="scope" data-testid="scope-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Just me</SelectItem>
                    <SelectItem value="team">The whole team (a Team template)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v as TemplateCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                placeholder={
                  activeTab === 'text'
                    ? 'Hi, are you taking on work?'
                    : 'Hi, I noticed you don\'t have a website...'
                }
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.title.trim() || !formData.content.trim()}
            >
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Template Dialog (Full Screen Popup) */}
      <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHero
            icon={viewingTemplate?.template_type === 'voice_script' ? Mic : MessageSquare}
            tone="blue"
            title={viewingTemplate?.title}
            subtitle={TEMPLATE_CATEGORY_OPTIONS.find((c) => c.value === viewingTemplate?.category)?.label || viewingTemplate?.category}
          />
          <ScrollArea className="max-h-[50vh]">
            <div className="py-4">
              <p className="text-lg leading-relaxed whitespace-pre-wrap">
                {viewingTemplate?.content}
              </p>
            </div>
          </ScrollArea>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                if (viewingTemplate) {
                  copyToClipboard(viewingTemplate.content, viewingTemplate.title);
                }
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            {viewingTemplate && isTeamTemplate(viewingTemplate) && !canManageTemplate(viewingTemplate, who) && (
              <Button variant="outline" onClick={() => { void duplicateToMine(viewingTemplate); setViewingTemplate(null); }}>
                <CopyPlus className="h-4 w-4 mr-2" />
                Save as my template
              </Button>
            )}
            {viewingTemplate && canManageTemplate(viewingTemplate, who) && (
              <Button
                variant="outline"
                onClick={() => {
                  openEditDialog(viewingTemplate);
                  setViewingTemplate(null);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            <Button onClick={() => setViewingTemplate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Templates;
