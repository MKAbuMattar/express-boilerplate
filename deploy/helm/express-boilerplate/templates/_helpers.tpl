{{/* Chart name, overridable. */}}
{{- define "eb.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Release-qualified name, max 63 characters (DNS label). */}}
{{- define "eb.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "eb.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Stable labels for selectors: never add version here (selectors are immutable). */}}
{{- define "eb.selectorLabels" -}}
app.kubernetes.io/name: {{ include "eb.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Recommended Kubernetes labels. */}}
{{- define "eb.labels" -}}
helm.sh/chart: {{ include "eb.chart" . }}
{{ include "eb.selectorLabels" . }}
app.kubernetes.io/version: {{ (default .Chart.AppVersion .Values.image.tag) | trunc 63 | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: express-boilerplate
{{- end -}}

{{- define "eb.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "eb.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* image@digest when a digest is set (immutable), else image:tag. */}}
{{- define "eb.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end -}}

{{/* Container port: 8443 with in-pod TLS, else 8080 (non-root cannot bind < 1024). */}}
{{- define "eb.port" -}}
{{- if .Values.tls.enabled -}}8443{{- else -}}8080{{- end -}}
{{- end -}}

{{- define "eb.scheme" -}}
{{- if .Values.tls.enabled -}}HTTPS{{- else -}}HTTP{{- end -}}
{{- end -}}

{{/* Secret holding the app secrets: an existing one, or the ExternalSecret target. */}}
{{- define "eb.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "eb.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "eb.hasSecret" -}}
{{- if or .Values.secrets.existingSecret .Values.externalSecret.enabled -}}true{{- end -}}
{{- end -}}

{{/*
Non-secret environment, as KEY: "value" lines. Chart-computed settings come
first; .Values.config overrides them. Shared by the ConfigMap and the
migration Job (which may run before the ConfigMap exists).
*/}}
{{- define "eb.env" -}}
{{- $base := dict
  "NODE_ENV" "production"
  "HOST" "0.0.0.0"
  "PORT" (include "eb.port" .)
  "TLS_ENABLED" (ternary "true" "false" .Values.tls.enabled)
  "TRUST_PROXY" (toString .Values.trustProxyHops)
  "DB_MIGRATIONS_RUN" (ternary "false" "true" .Values.migrations.enabled)
-}}
{{- if .Values.tls.enabled -}}
{{- $_ := set $base "TLS_CERT_FILE" "/etc/tls/tls.crt" -}}
{{- $_ := set $base "TLS_KEY_FILE" "/etc/tls/tls.key" -}}
{{- $_ := set $base "TLS_CA_FILE" "/etc/tls/ca.crt" -}}
{{- end -}}
{{- $env := merge (deepCopy (default (dict) .Values.config)) $base -}}
{{- range $key := keys $env | sortAlpha }}
{{ $key }}: {{ get $env $key | toString | quote }}
{{- end -}}
{{- end -}}

{{/* Restricted pod security context and the matching container context. */}}
{{- define "eb.podSecurityContext" -}}
{{- toYaml .Values.podSecurityContext -}}
{{- end -}}

{{- define "eb.containerSecurityContext" -}}
{{- toYaml .Values.securityContext -}}
{{- end -}}
