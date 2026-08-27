mod ssh_helper;
pub mod transcode;

pub fn run_ssh_helper_standalone() -> ! {
    ssh_helper::run_standalone()
}
