export function helpHtml(): string {
  return `<div class="help-grid">
    <div>
      <h3>Goal</h3>
      Win by <b>Conquest</b> (eliminate every rival), <b>Hegemony</b> (control 60% of star systems) or
      <b>Ascension</b> (complete the Ascension Project — it needs 600 ✦ exotic matter). Rivals can win the same ways, so keep an eye on them.
      <h3>Economy</h3>
      Colonies grow population, which produces ₵ credits and research. Each building needs one worker.
      <b>Constructors</b> build orbital stations anywhere you can reach: mining stations on rocks and belts, gas harvesters on giants,
      solar arrays on stars, research outposts on anomalies, artifacts, pulsars and black holes. Everything costs ⚡ energy upkeep —
      run out and your economy browns out. Every extra colony adds administration costs and makes research dearer, so grow deliberately.
      <h3>Research</h3>
      Open the tree with <kbd>R</kbd>. Unlock new hulls, weapons, shields, megastructures (Dyson swarms) and bonuses.
      Clicking a locked tech queues its prerequisites automatically.
    </div>
    <div>
      <h3>Fleets</h3>
      Build ships at colonies with an <b>Orbital Shipyard</b>. Select a fleet, then <b>right-click</b> a planet, gate, point in space or enemy
      fleet to move or attack. Right-click a system on the galaxy map to travel there through tunnels.
      Your fleet capacity grows with colonies and hull research.
      <h3>Combat</h3>
      Hostile fleets fight automatically when they meet. Lasers shred shields, railguns crack armour, missiles hit hard but point defense
      shoots them down. Knock a planet's defenses to zero, then land <b>Troop Transports</b> to capture it.
      <h3>Controls</h3>
      <kbd>Left-drag</kbd> rotate · <kbd>Right-drag</kbd>/<kbd>WASD</kbd> pan · <kbd>Wheel</kbd> zoom · <kbd>Click</kbd> select ·
      <kbd>Double-click</kbd> focus / enter system · <kbd>Space</kbd> pause · <kbd>1</kbd>–<kbd>4</kbd> speed · <kbd>G</kbd> galaxy map ·
      <kbd>H</kbd> home · <kbd>R</kbd> research · <kbd>E</kbd> empires · <kbd>F</kbd> focus selection · <kbd>Esc</kbd> menu · <kbd>Right-click</kbd> a badge or message to dismiss it
    </div>
  </div>`;
}
