import { Image } from 'react-native'

type Props = {
  size?: number
}

export function DorkaLogo({ size = 24 }: Props) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.2 }}
    />
  )
}
