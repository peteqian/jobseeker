import { type ReactNode, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function CommaSeparatedInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  icon,
}: {
  id: string;
  name: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  // When set, the field renders icon-led with no separate label.
  icon?: ReactNode;
}) {
  const [draft, setDraft] = useState(() => value.join(", "));

  useEffect(() => {
    setDraft(value.join(", "));
  }, [value]);

  const commit = () => {
    const next = draft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    onChange(next);
  };

  const handleBlur = () => {
    commit();
    onBlur?.();
  };
  const handleChange = (event: { target: { value: string } }) => setDraft(event.target.value);
  const handleKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  if (icon) {
    return (
      <InputGroup>
        <InputGroupAddon>{icon}</InputGroupAddon>
        <InputGroupInput
          id={id}
          name={name}
          aria-label={placeholder}
          value={draft}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      </InputGroup>
    );
  }

  return (
    <Input
      id={id}
      name={name}
      value={draft}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
    />
  );
}
