use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ureq::http::Response;

use crate::error::CliError;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Org,
    Public,
}

impl Visibility {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Org => "org",
            Self::Public => "public",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct PageResult {
    pub id: String,
    pub url: String,
    #[serde(rename = "rawUrl")]
    pub raw_url: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExportResult {
    pub data: Vec<u8>,
    pub filename: String,
}

pub trait ApiClient {
    fn publish(
        &self,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError>;
    fn update(
        &self,
        id: &str,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError>;
    fn set_visibility(&self, id: &str, visibility: Visibility) -> Result<PageResult, CliError>;
    fn list(&self) -> Result<Value, CliError>;
    fn delete(&self, id: &str) -> Result<(), CliError>;
    fn me(&self) -> Result<Value, CliError>;
    fn export_file(&self, id: &str, format: &str) -> Result<ExportResult, CliError>;
    fn list_templates(&self, _category: Option<&str>) -> Result<Value, CliError> {
        Ok(serde_json::json!([]))
    }
    fn get_template(&self, _slug: &str, _version: Option<u32>) -> Result<Value, CliError> {
        Err(CliError::new("Template lookup not implemented"))
    }
}

#[derive(Clone)]
pub struct KioskClient {
    agent: ureq::Agent,
    api_base: String,
    token: String,
}

impl KioskClient {
    pub fn new(api_base: String, token: String) -> Self {
        let agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(30)))
            .build()
            .new_agent();
        Self {
            agent,
            api_base,
            token,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.api_base, path)
    }

    fn authorization(&self) -> String {
        format!("Bearer {}", self.token)
    }

    fn transport_error(error: ureq::Error) -> CliError {
        CliError::new(format!(
            "Network request failed: {error}. Check the API URL and try again."
        ))
    }

    fn parse_json<T: for<'de> Deserialize<'de>>(
        &self,
        mut response: Response<ureq::Body>,
    ) -> Result<T, CliError> {
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let bytes = response
            .body_mut()
            .read_to_vec()
            .map_err(Self::transport_error)?;
        if !(200..300).contains(&status) {
            return Err(api_error(status, &bytes, retry_after.as_deref()));
        }
        serde_json::from_slice(&bytes)
            .map_err(|error| CliError::new(format!("Invalid API response: {error}")))
    }

    pub fn publish(
        &self,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        let mut request = self
            .agent
            .post(self.url("/pages"))
            .header("authorization", self.authorization())
            .content_type("text/html");
        if let Some(title) = title {
            request = request.header("x-kiosk-title", title);
        }
        if let Some(visibility) = visibility {
            request = request.header("x-kiosk-visibility", visibility.as_str());
        }
        let response = request.send(html).map_err(Self::transport_error)?;
        self.parse_json(response)
    }

    pub fn update(
        &self,
        id: &str,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        let mut request = self
            .agent
            .put(self.url(&format!("/pages/{id}")))
            .header("authorization", self.authorization())
            .content_type("text/html");
        if let Some(title) = title {
            request = request.header("x-kiosk-title", title);
        }
        if let Some(visibility) = visibility {
            request = request.header("x-kiosk-visibility", visibility.as_str());
        }
        let response = request.send(html).map_err(Self::transport_error)?;
        self.parse_json(response)
    }

    pub fn set_visibility(&self, id: &str, visibility: Visibility) -> Result<PageResult, CliError> {
        let body = serde_json::to_string(&serde_json::json!({
            "visibility": visibility.as_str()
        }))
        .map_err(|error| CliError::new(error.to_string()))?;
        let response = self
            .agent
            .patch(self.url(&format!("/pages/{id}")))
            .header("authorization", self.authorization())
            .content_type("application/json")
            .send(&body)
            .map_err(Self::transport_error)?;
        self.parse_json(response)
    }

    pub fn list(&self) -> Result<Value, CliError> {
        let response = self
            .agent
            .get(self.url("/pages"))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        self.parse_json(response)
    }

    pub fn delete(&self, id: &str) -> Result<(), CliError> {
        let mut response = self
            .agent
            .delete(self.url(&format!("/pages/{id}")))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let bytes = response
                .body_mut()
                .read_to_vec()
                .map_err(Self::transport_error)?;
            return Err(api_error(status, &bytes, retry_after.as_deref()));
        }
        Ok(())
    }

    pub fn me(&self) -> Result<Value, CliError> {
        let response = self
            .agent
            .get(self.url("/me"))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        self.parse_json(response)
    }

    pub fn export_file(&self, id: &str, format: &str) -> Result<ExportResult, CliError> {
        let mut response = self
            .agent
            .get(self.url(&format!("/pages/{id}/export?format={format}")))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let disposition = response
            .headers()
            .get("content-disposition")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        let data = response
            .body_mut()
            .with_config()
            .limit(100 * 1024 * 1024)
            .read_to_vec()
            .map_err(Self::transport_error)?;
        if !(200..300).contains(&status) {
            return Err(api_error(status, &data, retry_after.as_deref()));
        }
        Ok(ExportResult {
            filename: attachment_filename(&disposition).unwrap_or_else(|| format!("{id}.{format}")),
            data,
        })
    }

    pub fn list_templates(&self, category: Option<&str>) -> Result<Value, CliError> {
        let path = match category {
            Some(cat) if !cat.is_empty() => format!("/templates?category={cat}"),
            _ => "/templates".to_owned(),
        };
        let response = self
            .agent
            .get(self.url(&path))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        let parsed: Value = self.parse_json(response)?;
        Ok(parsed
            .get("templates")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])))
    }

    pub fn get_template(&self, slug: &str, version: Option<u32>) -> Result<Value, CliError> {
        let path = match version {
            Some(v) => format!("/templates/{slug}?version={v}"),
            None => format!("/templates/{slug}"),
        };
        let response = self
            .agent
            .get(self.url(&path))
            .header("authorization", self.authorization())
            .call()
            .map_err(Self::transport_error)?;
        self.parse_json(response)
    }
}

impl ApiClient for KioskClient {
    fn publish(
        &self,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        KioskClient::publish(self, html, title, visibility)
    }

    fn update(
        &self,
        id: &str,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        KioskClient::update(self, id, html, title, visibility)
    }

    fn set_visibility(&self, id: &str, visibility: Visibility) -> Result<PageResult, CliError> {
        KioskClient::set_visibility(self, id, visibility)
    }

    fn list(&self) -> Result<Value, CliError> {
        KioskClient::list(self)
    }

    fn delete(&self, id: &str) -> Result<(), CliError> {
        KioskClient::delete(self, id)
    }

    fn me(&self) -> Result<Value, CliError> {
        KioskClient::me(self)
    }

    fn export_file(&self, id: &str, format: &str) -> Result<ExportResult, CliError> {
        KioskClient::export_file(self, id, format)
    }

    fn list_templates(&self, category: Option<&str>) -> Result<Value, CliError> {
        KioskClient::list_templates(self, category)
    }

    fn get_template(&self, slug: &str, version: Option<u32>) -> Result<Value, CliError> {
        KioskClient::get_template(self, slug, version)
    }
}

fn api_error(status: u16, body: &[u8], retry_after: Option<&str>) -> CliError {
    let mut message = serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|body| body.pointer("/error/message")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| format!("HTTP {status}"));
    if status == 429 && retry_after.is_some_and(|value| value.bytes().all(|b| b.is_ascii_digit())) {
        message.push_str(&format!(". Retry in {} seconds.", retry_after.unwrap()));
    }
    if status == 401 {
        CliError::auth(message)
    } else {
        CliError::new(message)
    }
}

fn attachment_filename(disposition: &str) -> Option<String> {
    disposition
        .split(';')
        .map(str::trim)
        .find_map(|part| part.strip_prefix("filename=\"")?.strip_suffix('"'))
        .map(str::to_owned)
}
