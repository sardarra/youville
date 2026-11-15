// Six spaced columns follow the order of the buildings along the street.
// Smaller park/street details occupy a second row, so pinned cards never collide.
const slots: Record<string, [number, number]> = {
  'Office.svg': [0, 0], 'House.svg': [1, 0], 'School.svg': [2, 0],
  'Hospital.svg': [3, 0], 'Thall.svg': [4, 0], 'Bank.svg': [5, 0],
  'Street Sign.svg': [0, 1], 'Mailbox.svg': [1, 1], park: [2, 1],
}
export function bubblePreset(file: string, sceneWidth: number, sceneHeight: number) {
  const [column, row] = slots[file] ?? [0, 0]
  const width = 340
  const height = Math.min(280, (sceneHeight - 48) / 2)
  return { left: 12 + column * ((sceneWidth - 24 - width) / 5), top: 16 + row * (height + 16), width, height }
}
