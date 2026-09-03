import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { MessageSquare, Send, Edit2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface DraftCommentsProps {
  draftId: number;
}

export function DraftComments({ draftId }: DraftCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.draftComments.list.useQuery({ draftId });

  const createComment = trpc.draftComments.create.useMutation({
    onSuccess: () => {
      utils.draftComments.list.invalidate({ draftId });
      setNewComment("");
      toast.success("Comment added");
    },
    onError: (error) => {
      toast.error(`Failed to add comment: ${error.message}`);
    },
  });

  const updateComment = trpc.draftComments.update.useMutation({
    onSuccess: () => {
      utils.draftComments.list.invalidate({ draftId });
      setEditingId(null);
      setEditContent("");
      toast.success("Comment updated");
    },
    onError: (error) => {
      toast.error(`Failed to update comment: ${error.message}`);
    },
  });

  const deleteComment = trpc.draftComments.delete.useMutation({
    onSuccess: () => {
      utils.draftComments.list.invalidate({ draftId });
      toast.success("Comment deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete comment: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    createComment.mutate({ draftId, content: newComment });
  };

  const handleUpdate = (id: number) => {
    if (!editContent.trim()) return;
    updateComment.mutate({ id, content: editContent });
  };

  const startEdit = (id: number, content: string) => {
    setEditingId(id);
    setEditContent(content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading comments...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h3 className="font-semibold">Discussion</h3>
        <span className="text-sm text-muted-foreground">
          ({comments?.length || 0} {comments?.length === 1 ? "comment" : "comments"})
        </span>
      </div>

      {/* Comment List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {comments && comments.length > 0 ? (
          comments.map((comment) => (
            <Card key={comment.id} className="p-3">
              {editingId === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[80px]"
                    placeholder="Edit your comment..."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(comment.id)}
                      disabled={updateComment.isPending}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {comment.authorName || "Unknown User"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(comment.id, comment.content)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this comment?")) {
                            deleteComment.mutate({ id: comment.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet. Start the discussion!
          </p>
        )}
      </div>

      {/* New Comment Form */}
      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment to discuss this report configuration..."
          className="min-h-[100px]"
        />
        <Button
          onClick={handleSubmit}
          disabled={!newComment.trim() || createComment.isPending}
          className="w-full"
        >
          <Send className="h-4 w-4 mr-2" />
          Post Comment
        </Button>
      </div>
    </div>
  );
}
