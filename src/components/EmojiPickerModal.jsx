import React from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export function EmojiPickerModal({
  isOpen,
  onClose,
  folder,
  onSelectEmoji,
  appTheme,
}) {
  if (!folder) return null;

  const handleEmojiClick = (emojiData) => {
    // emojiData.emoji is the actual unicode emoji character (e.g. '🚀')
    onSelectEmoji(folder.id, emojiData.emoji);
    onClose();
  };

  const handleRemoveEmoji = () => {
    onSelectEmoji(folder.id, null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-[400px] p-4 flex flex-col gap-4">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-sm font-semibold tracking-wide uppercase">
            Select Emoji for "{folder.name}"
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Choose an emoji icon to customize this folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center w-full min-h-[350px]">
          <EmojiPicker
            theme={appTheme === "dark" ? Theme.DARK : Theme.LIGHT}
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            width="100%"
            height={380}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled={true}
            searchPlaceHolder="Search emojis..."
          />
        </div>

        {folder.emoji && (
          <button
            onClick={handleRemoveEmoji}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all duration-150 cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Remove Custom Emoji</span>
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
