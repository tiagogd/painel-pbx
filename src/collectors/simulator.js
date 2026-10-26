// Centrais fictícias até a Task 7 ler as reais do banco.
export const simulatedCentrals = [
  { id: 1, name: 'Matriz', ip: '10.0.0.10', type: 'asterisk', collectMethod: 'simulator' },
  { id: 2, name: 'Filial Sul', ip: '10.0.0.20', type: 'issabel', collectMethod: 'simulator' },
  { id: 3, name: 'Filial Norte', ip: '10.0.0.30', type: 'freepbx', collectMethod: 'simulator' },
];

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

export async function collect(central) {
  // Central 3 oscila: metade dos ciclos fica crítica.
  const hot = central.id === 3 && Math.floor(Date.now() / 10000) % 2 === 0;
  return {
    cpu: hot ? rand(91, 99) : rand(10, 60),
    mem: rand(30, 70),
    disk: rand(20, 60),
  };
}
