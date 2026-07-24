import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'
import { GeoConfirmToast } from '@/components/GeoConfirmToast'

export function PublicLayout() {
  return (
    <>
      <Header />
      <GeoConfirmToast />
      <Outlet />
    </>
  )
}
