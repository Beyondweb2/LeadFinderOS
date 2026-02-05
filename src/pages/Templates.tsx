import { useState } from 'react';
import { useTemplates } from '@/hooks/useTemplates';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Loader2, 
  Plus, 
  Copy, 
  Pencil, 
  Trash2,
  MessageSquare,
  Mic,
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
    copyToClipboard 
  } = useTemplates();

  const [activeTab, setActiveTab] = useState<TemplateType>('text');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'other' as TemplateCategory,
  });

  const textTemplates = templates.filter((t) => t.template_type === 'text');
  const voiceTemplates = templates.filter((t) => t.template_type === 'voice_script');

  const openCreateDialog = (type: TemplateType) => {
    setEditingTemplate(null);
    setFormData({ title: '', content: '', category: 'other' });
    setActiveTab(type);
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      title: template.title,
      content: template.content,
      category: template.category,
    });
    setIsDialogOpen(true);
  };

  const openViewDialog = (template: Template) => {
    setViewingTemplate(template);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;

    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, formData);
    } else {
      await createTemplate({
        template_type: activeTab,
        category: formData.category,
        title: formData.title,
        content: formData.content,
      });
    }

    setIsDialogOpen(false);
    setFormData({ title: '', content: '', category: 'other' });
    setEditingTemplate(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      await deleteTemplate(id);
    }
  };

  const TemplateCard = ({ template, onClick }: { template: Template; onClick: () => void }) => (
    <Card 
      className="bg-card/50 border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{template.title}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {TEMPLATE_CATEGORY_OPTIONS.find((c) => c.value === template.category)?.label || template.category}
            </CardDescription>
          </div>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => copyToClipboard(template.content, template.title)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openEditDialog(template)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDelete(template.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-muted-foreground">
          Manage your text messages and voice note scripts
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateType)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="text" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Text Messages ({textTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="voice_script" className="gap-2">
              <Mic className="h-4 w-4" />
              Voice Scripts ({voiceTemplates.length})
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => openCreateDialog(activeTab)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Template
          </Button>
        </div>

        <TabsContent value="text" className="mt-6">
          {textTemplates.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No text templates yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create templates for your initial texts and follow-ups.
                </p>
                <Button onClick={() => openCreateDialog('text')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {textTemplates.map((template) => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onClick={() => openViewDialog(template)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="voice_script" className="mt-6">
          {voiceTemplates.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="py-12 text-center">
                <Mic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No voice scripts yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create scripts for your voice note pitches.
                </p>
                <Button onClick={() => openCreateDialog('voice_script')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Script
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {voiceTemplates.map((template) => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onClick={() => openViewDialog(template)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'text' 
                ? 'Create a text message template for quick copying.'
                : 'Create a voice note script to guide your pitches.'}
            </DialogDescription>
          </DialogHeader>
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
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {viewingTemplate?.template_type === 'voice_script' ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MessageSquare className="h-5 w-5" />
              )}
              {viewingTemplate?.title}
            </DialogTitle>
            <DialogDescription>
              {TEMPLATE_CATEGORY_OPTIONS.find((c) => c.value === viewingTemplate?.category)?.label || viewingTemplate?.category}
            </DialogDescription>
          </DialogHeader>
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
            <Button
              variant="outline"
              onClick={() => {
                if (viewingTemplate) {
                  openEditDialog(viewingTemplate);
                  setViewingTemplate(null);
                }
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
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
