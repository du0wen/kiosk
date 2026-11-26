use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::args::{Command, ExportFormat};
use crate::client::{ApiClient, Visibility};
use crate::config::Config;
use crate::error::CliError;
use crate::state::{
    Identity, PageMapping, find_project_root, mapping_key, resolve_identity, write_mapping,
};

pub fn require_token(config: &Config) -> Result<&str, CliError> {
    config
        .token
        .as_deref()
        .ok_or_else(|| CliError::auth("Not logged in. Run `kiosk login` or set KIOSK_TOKEN."))
}

pub fn execute_api_command(
    command: &Command,
    client: &impl ApiClient,
    cwd: &Path,
    stdout: &mut impl Write,
    stderr: &mut impl Write,
) -> Result<(), CliError> {
    match command {
        Command::Publish(args) => {
            let file = resolve_from(cwd, &args.file);
            let root = find_project_root(cwd);
            let html = fs::read_to_string(&file)?;
            let fallback_title = file
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| CliError::new("Page file must have a valid UTF-8 filename"))?;
            let title = args.title.as_deref().unwrap_or(fallback_title);
            let visibility = args.public.then_some(Visibility::Public);
            let page = match resolve_identity(&root, &file, args.id.as_deref(), args.force_new) {
                Identity::Create => client.publish(&html, Some(title), visibility)?,
                Identity::Update(id) => client.update(&id, &html, Some(title), visibility)?,
            };
            let key = mapping_key(&root, &file)?;
            write_mapping(
                &root,
                key,
                PageMapping {
                    id: page.id.clone(),
                    url: page.url.clone(),
                },
            )?;
            if args.json {
                let output = serde_json::json!({ "url": page.url });
                writeln!(stdout, "{}", serde_json::to_string(&output).unwrap())?;
            } else {
                writeln!(stdout, "{}", page.url)?;
                if !args.public {
                    writeln!(
                        stderr,
                        "(private to your org — add --public or use the console to share publicly)"
                    )?;
                }
            }
        }
        Command::Share(args) => {
            let visibility = if args.public {
                Visibility::Public
            } else {
                Visibility::Org
            };
            let page = client.set_visibility(&args.id, visibility)?;
            writeln!(
                stdout,
                "{} ({})",
                page.url,
                page.visibility.as_deref().unwrap_or("undefined")
            )?;
        }
        Command::Export(args) => {
            let format = args.format.as_str();
            let export = client.export_file(&args.id, format)?;
            if let Some(output) = &args.output {
                fs::write(resolve_from(cwd, output), export.data)?;
                writeln!(stdout, "Saved {}", output.display())?;
            } else if matches!(args.format, ExportFormat::Md | ExportFormat::Html) {
                stdout.write_all(&export.data)?;
            } else {
                return Err(CliError::new(format!(
                    "Binary format {format} needs -o <file>"
                )));
            }
        }
        Command::List => write_pretty_json(stdout, &client.list()?)?,
        Command::Delete(args) => {
            client.delete(&args.id)?;
            writeln!(stdout, "Deleted.")?;
        }
        Command::Whoami => write_pretty_json(stdout, &client.me()?)?,
        Command::Templates(args) => {
            write_pretty_json(stdout, &client.list_templates(args.category.as_deref())?)?
        }
        Command::Template(args) => {
            let tpl = client.get_template(&args.slug, args.version)?;
            if args.html {
                if let Some(html) = tpl.get("html").and_then(|v| v.as_str()) {
                    writeln!(stdout, "{html}")?;
                }
            } else {
                write_pretty_json(stdout, &tpl)?;
            }
        }
        Command::Login(_) | Command::Logout | Command::Open(_) | Command::InstallSkill(_) => {
            return Err(CliError::new(
                "Internal command routing error: expected a REST command",
            ));
        }
    }
    Ok(())
}

fn resolve_from(cwd: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

fn write_pretty_json(stdout: &mut impl Write, value: &serde_json::Value) -> Result<(), CliError> {
    serde_json::to_writer_pretty(&mut *stdout, value)
        .map_err(|error| CliError::new(error.to_string()))?;
    writeln!(stdout)?;
    Ok(())
}
