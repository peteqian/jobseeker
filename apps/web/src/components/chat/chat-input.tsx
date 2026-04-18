import { Send } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { type ChatModelSelection } from "@jobseeker/contracts";

import { CompactComposerControlsMenu } from "@/components/chat/compact-composer-controls-menu";
import { ProviderModelPicker, type ProviderOption } from "@/components/chat/provider-model-picker";
import { TraitsPicker } from "@/components/chat/traits-picker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  providers?: readonly ProviderOption[];
  selection?: ChatModelSelection;
  onSelectionChange?: (selection: ChatModelSelection) => void;
}

export function ChatInput({
  onSend,
  disabled,
  providers,
  selection,
  onSelectionChange,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function pickEffort(effort: string) {
    if (!selection) return;
    onSelectionChange?.({ ...selection, effort });
  }

  const activeProvider = providers?.find((p) => p.id === selection?.provider);
  const activeModel = activeProvider?.models.find((m) => m.slug === selection?.model);

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="rounded-[20px] border bg-background shadow-xs">
        <div className="px-3 pt-3 sm:px-4 sm:pt-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="min-h-[72px] w-full resize-none bg-transparent px-0 py-0 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
        </div>

        <div
          data-chat-composer-footer="true"
          className="flex flex-wrap items-center justify-between gap-2 border-t px-2 py-2 sm:px-3"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <ProviderModelPicker
              providers={providers}
              selection={selection}
              disabled={disabled}
              onSelectionChange={onSelectionChange}
            />
            <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
            <TraitsPicker
              model={activeModel}
              selection={selection}
              onSelectionChange={(nextSelection) => {
                if (nextSelection.effort) {
                  pickEffort(nextSelection.effort);
                  return;
                }
                onSelectionChange?.(nextSelection);
              }}
              disabled={disabled}
              className="hidden sm:inline-flex"
            />
            <CompactComposerControlsMenu
              model={activeModel}
              selection={selection}
              disabled={disabled}
              onSelectionChange={(nextSelection) => {
                if (nextSelection.effort) {
                  pickEffort(nextSelection.effort);
                  return;
                }
                onSelectionChange?.(nextSelection);
              }}
            />
          </div>

          <div data-chat-composer-actions="right" className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="shrink-0 rounded-full px-3"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
