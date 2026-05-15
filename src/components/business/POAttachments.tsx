import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Attachment {
  id: string;
  file_name: string;
  content_type: string | null;
  storage_path: string;
  public_url: string | null;
}

interface POAttachmentsProps {
  poId: string;
}

export const POAttachments: React.FC<POAttachmentsProps> = ({ poId }) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('po_attachments')
        .select('id, file_name, content_type, storage_path, public_url')
        .eq('po_id', poId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAttachments(data || []);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const handleDelete = async (att: Attachment) => {
    try {
      const bucket = 'po-attachments';
      await (supabase as any).storage.from(bucket).remove([att.storage_path]);
      const { error } = await (supabase as any)
        .from('po_attachments')
        .delete()
        .eq('id', att.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Attachment deleted' });
      load();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete attachment', variant: 'destructive' });
    }
  };

  const handleImageClick = (att: Attachment) => {
    const isImage = (att.content_type || '').startsWith('image/');
    if (isImage) {
      setSelectedImage(att);
      setImageModalOpen(true);
    } else {
      // For non-images (like PDFs), open in new tab
      window.open(att.public_url || '#', '_blank');
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading attachments...</div>;

  if (attachments.length === 0) return <div className="text-sm text-muted-foreground">No attachments</div>;

  return (
    <>
      <div className="space-y-2">
        <h4 className="font-medium">Attachments</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {attachments.map(att => {
            const isImage = (att.content_type || '').startsWith('image/');
            const url = att.public_url || '#';
            return (
              <div key={att.id} className="border rounded p-2 flex flex-col gap-2">
                <div 
                  className="cursor-pointer"
                  onClick={() => handleImageClick(att)}
                >
                  {isImage ? (
                    <img src={url} alt={att.file_name} className="w-full h-28 object-cover rounded hover:opacity-80 transition-opacity" />
                  ) : (
                    <div className="h-28 flex items-center justify-center bg-muted rounded text-sm hover:bg-muted/80 transition-colors">
                      {att.file_name}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate" title={att.file_name}>{att.file_name}</span>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(att)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Preview Modal */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle>{selectedImage?.file_name}</DialogTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setImageModalOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="p-6 pt-0 flex justify-center items-center min-h-[400px]">
            {selectedImage && (
              <img 
                src={selectedImage.public_url || '#'} 
                alt={selectedImage.file_name}
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};


