use crate::state::State;

pub fn start() {
    let state = State::load();
    state.save();
}

#[cfg(test)]
mod tests {
    #[test]
    fn starts() {
        super::start();
    }
}
