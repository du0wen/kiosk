use std::collections::HashMap;
use std::env;
use std::io::{self, IsTerminal, Write};
use std::process::ExitCode;

use clap::{CommandFactory, Parser};
use kiosk_cli::args::{Cli, Command};
use kiosk_cli::auth::browser_login;
use kiosk_cli::browser::SystemBrowser;
use kiosk_cli::client::KioskClient;
use kiosk_cli::commands::{execute_api_command, require_token};
use kiosk_cli::config::{
    Config, display_origin, home_from_env, normalize_api_base, resolve_config, save_config,
};
use kiosk_cli::error::CliError;
use kiosk_cli::session::{
    LoginMethod, login_with_token, logout, open_mapped_page, prompt_login_plan,
};
use kiosk_cli::skills::{InstallSkillOptions, install_skill};
use kiosk_cli::state::find_project_root;

fn main() -> ExitCode {
    let cli = Cli::parse();
    if cli.command.is_none() {
        let mut command = Cli::command();
        command.print_help().expect("help output must be writable");
        println!();
        return ExitCode::SUCCESS;
    }

    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("kiosk: {error}");
            ExitCode::from(error.exit_code)
        }
    }
}

fn run(cli: Cli) -> Result<(), CliError> {
    let command = cli.command.as_ref().expect("command checked by main");
    let environment = env::vars().collect::<HashMap<_, _>>();
    let home = home_from_env(&environment)?;
    let config = resolve_config(&home, &environment);
    let cwd = env::current_dir()?;
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    match command {
        Command::Login(args) => {
            let provided_token = args
                .token
                .as_deref()
                .or_else(|| environment.get("KIOSK_TOKEN").map(String::as_str));
            let has_explicit_host =
                args.host.is_some() || environment.contains_key("KIOSK_API_BASE");

            let (api_base, method) = if let Some(token) = provided_token {
                let target_base = match args.host.as_deref() {
                    Some(host) => normalize_api_base(host)?,
                    None => config.api_base.clone(),
                };
                (target_base, LoginMethod::Token(token.to_owned()))
            } else if has_explicit_host || !io::stdin().is_terminal() {
                let target_base = match args.host.as_deref() {
                    Some(host) => normalize_api_base(host)?,
                    None => config.api_base.clone(),
                };
                (target_base, LoginMethod::Browser)
            } else {
                let stdin = io::stdin();
                let mut stdin = stdin.lock();
                let plan = prompt_login_plan(&config.api_base, &mut stdin, &mut stdout)?;
                (plan.api_base, plan.method)
            };

            match method {
                LoginMethod::Token(token) => {
                    let client = KioskClient::new(api_base.clone(), token.clone());
                    login_with_token(&home, &api_base, &token, &client)?;
                }
                LoginMethod::Browser => {
                    let token = browser_login(&api_base, &SystemBrowser, &mut stdout)?;
                    save_config(
                        &home,
                        &Config {
                            token: Some(token),
                            api_base: api_base.clone(),
                        },
                    )?;
                }
            }
            writeln!(stdout, "Logged in to {}.", display_origin(&api_base))?;
            Ok(())
        }
        Command::Logout => {
            logout(&home, &config.api_base)?;
            writeln!(stdout, "Logged out.")?;
            Ok(())
        }
        Command::Open(args) => {
            let target = if args.file.is_absolute() {
                args.file.clone()
            } else {
                cwd.join(&args.file)
            };
            let root = find_project_root(&cwd);
            open_mapped_page(&root, &target, &SystemBrowser, &mut stdout)
        }
        Command::InstallSkill(args) => {
            let options = InstallSkillOptions::from_flags(args.claude, args.codex);
            let written = install_skill(&cwd, options)?;
            writeln!(stdout, "Installed skill files:")?;
            for path in written {
                writeln!(stdout, "  {}", path.display())?;
            }
            Ok(())
        }
        _ => {
            let token = require_token(&config)?;
            let client = KioskClient::new(config.api_base.clone(), token.to_owned());
            execute_api_command(
                command,
                &client,
                &cwd,
                &mut stdout,
                &mut io::stderr().lock(),
            )
        }
    }
}
