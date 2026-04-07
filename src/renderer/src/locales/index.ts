import { createI18n } from 'vue-i18n'
import en from './en'
import zh from './zh'
import defaultLang from './default'

const savedLang = localStorage.getItem('lang') || 'default'

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'default',
  messages: {
    en,
    zh,
    default: defaultLang
  }
})

export default i18n
