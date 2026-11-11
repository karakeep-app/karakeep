import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  getClientCertificate,
  importClientCertificate,
  isClientCertificateSupported,
  removeClientCertificate,
} from "@/modules/client-certificate";
import { FileKey2, ShieldCheck, Trash2 } from "lucide-react-native";

function askPassword(
  title: string,
  message: string,
  labels: { cancel: string; ok: string },
): Promise<string | undefined> {
  return new Promise((resolve) => {
    Alert.prompt(
      title,
      message,
      [
        {
          text: labels.cancel,
          style: "cancel",
          onPress: () => resolve(undefined),
        },
        { text: labels.ok, onPress: (value?: string) => resolve(value ?? "") },
      ],
      "secure-text",
    );
  });
}

/**
 * Lets the user install the TLS client certificate presented to their server
 * (mutual TLS). Changes apply immediately, independently of the surrounding
 * form. Renders nothing on platforms without support.
 */
export function ClientCertificateSection({
  serverAddress,
}: {
  /** The address currently typed in the form, to warn about plain http. */
  serverAddress: string;
}) {
  const { t, i18n } = useTranslation();
  const actions = useCommonActions();
  const { colors } = useColorScheme();
  const [certificate, setCertificate] = useState(getClientCertificate);
  const [error, setError] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [now] = useState(() => Date.now());

  if (!isClientCertificateSupported) {
    return null;
  }

  const handleImport = async () => {
    setError(undefined);
    // Otherwise the focused field keeps the keyboard, and typing lands there
    // instead of in the password prompt.
    Keyboard.dismiss();
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/x-pkcs12",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) {
      return;
    }
    const file = picked.assets[0];
    const password = await askPassword(
      t("client_certificate.password_title"),
      t("client_certificate.password_message", { name: file.name }),
      { cancel: actions.cancel, ok: t("client_certificate.import_confirm") },
    );
    if (password === undefined) {
      return;
    }

    setIsImporting(true);
    const result = await importClientCertificate(file.uri, password);
    setIsImporting(false);
    if (result.ok) {
      setCertificate(result.certificate);
      return;
    }
    setError(
      result.error === "wrong_password"
        ? t("client_certificate.wrong_password")
        : result.error === "invalid_file"
          ? t("client_certificate.invalid_file")
          : t("client_certificate.import_failed"),
    );
  };

  const handleRemove = () => {
    removeClientCertificate();
    setCertificate(null);
    setError(undefined);
  };

  const expiry = certificate?.expiresAt
    ? t(
        certificate.expiresAt < now
          ? "client_certificate.expired"
          : "client_certificate.expires",
        {
          date: new Date(certificate.expiresAt).toLocaleDateString(
            i18n.language,
          ),
        },
      )
    : undefined;
  const isExpired = !!certificate?.expiresAt && certificate.expiresAt < now;
  const usesPlainHttp = /^http:\/\//i.test(serverAddress.trim());

  return (
    <View className="gap-1.5">
      <GroupedSection
        header={t("client_certificate.header")}
        footer={error ? undefined : t("client_certificate.footer")}
      >
        {certificate && (
          <>
            <View className="min-h-11 flex-row items-center gap-3 px-4 py-2">
              <ShieldCheck size={20} color={colors.primary} />
              <View className="flex-1">
                <Text variant="subhead" numberOfLines={1}>
                  {certificate.subject || t("client_certificate.unnamed")}
                </Text>
                {expiry && (
                  <Text
                    variant="footnote"
                    color={isExpired ? undefined : "tertiary"}
                    className={isExpired ? "text-destructive" : undefined}
                    numberOfLines={1}
                  >
                    {expiry}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("client_certificate.remove")}
                onPress={handleRemove}
                hitSlop={10}
              >
                <Trash2 size={18} color={colors.destructive} />
              </Pressable>
            </View>
            <RowSeparator />
          </>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={isImporting}
          onPress={handleImport}
          className="min-h-11 flex-row items-center gap-2 px-4 py-2.5 active:opacity-60"
        >
          {isImporting ? (
            <ActivityIndicator size="small" />
          ) : (
            <FileKey2 size={18} color={colors.primary} />
          )}
          <Text className="text-primary">
            {certificate
              ? t("client_certificate.replace")
              : t("client_certificate.import")}
          </Text>
        </Pressable>
      </GroupedSection>
      {error && (
        <Text variant="footnote" className="px-4 text-destructive">
          {error}
        </Text>
      )}
      {certificate && usesPlainHttp && (
        <Text variant="footnote" className="px-4 text-destructive">
          {t("client_certificate.http_warning")}
        </Text>
      )}
    </View>
  );
}
