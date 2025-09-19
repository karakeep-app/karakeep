import React, { ChangeEvent, useRef } from "react";

import { ActionButton, ActionButtonProps } from "./action-button";

interface FilePickerButtonProps extends Omit<ActionButtonProps, "onClick"> {
  onFileSelect?: (file: File) => void;
  accept?: string;
  multiple?: boolean;
}

const FilePickerButton: React.FC<FilePickerButtonProps> = ({
  onFileSelect,
  accept,
  multiple = false,
  ...buttonProps
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      if (onFileSelect) {
        if (multiple) {
          Array.from(files).forEach(onFileSelect);
        } else {
          onFileSelect(files[0]);
        }
      }
    }
  };

  return (
    <div>
      <ActionButton onClick={handleButtonClick} {...buttonProps} />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept={accept}
        multiple={multiple}
      />
    </div>
  );
};

export default FilePickerButton;
