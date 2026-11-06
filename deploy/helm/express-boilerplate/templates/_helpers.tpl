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

{{/* Secret with tls.crt, tls.key and ca.crt: an existing one, or the chart's Certificate. */}}
{{- define "eb.tlsSecretName" -}}
{{- default (printf "%s-tls" (include "eb.fullname" .)) .Values.tls.secretName -}}
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
  "PORT" "443"
  "TLS_CERT_FILE" "/etc/tls/tls.crt"
  "TLS_KEY_FILE" "/etc/tls/tls.key"
  "TLS_CA_FILE" "/etc/tls/ca.crt"
  "DB_TLS" "true"
  "TRUST_PROXY" (toString .Values.trustProxyHops)
  "DB_MIGRATIONS_RUN" (ternary "false" "true" .Values.migrations.enabled)
-}}
{{- if .Values.database.caSecret }}
{{- $_ := set $base "DB_TLS_CA_FILE" "/etc/db-ca/ca.crt" }}
{{- end }}
{{- $env := merge (deepCopy (default (dict) .Values.config)) $base -}}
{{- range $key := keys $env | sortAlpha }}
{{ $key }}: {{ get $env $key | toString | quote }}
{{- end -}}
{{- end -}}

{{/*
The database server's CA (database.caSecret, key ca.crt), for databases on a
private CA (in-cluster Postgres, AWS RDS bundle). Mounted in the app pods and
the migration Job; DB_TLS_CA_FILE points at it.
*/}}
{{- define "eb.dbCaMount" -}}
{{- if .Values.database.caSecret }}
- name: db-ca
  mountPath: /etc/db-ca
  readOnly: true
{{- end }}
{{- end -}}

{{- define "eb.dbCaVolume" -}}
{{- if .Values.database.caSecret }}
- name: db-ca
  secret:
    secretName: {{ .Values.database.caSecret }}
    items:
      - key: ca.crt
        path: ca.crt
{{- end }}
{{- end -}}

{{/* Restricted pod security context and the matching container context. */}}
{{- define "eb.podSecurityContext" -}}
{{- toYaml .Values.podSecurityContext -}}
{{- end -}}

{{- define "eb.containerSecurityContext" -}}
{{- toYaml .Values.securityContext -}}
{{- end -}}
