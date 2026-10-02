import { Field } from "@/components/ui";
import { CUSTOMER_NAME_MAX_LENGTH, type CustomerErrors, type CustomerValues } from "@/lib/validation/customer";

// Campos compartidos por el alta y la edición de clientes.
export function CustomerFields({ values, errors }: { values: CustomerValues; errors?: CustomerErrors }) {
  return (
    <>
      <Field
        id="fullName"
        label="Nombre completo"
        autoComplete="off"
        required
        maxLength={CUSTOMER_NAME_MAX_LENGTH}
        defaultValue={values.fullName}
        error={errors?.fullName}
      />
      <Field
        id="dni"
        label="DNI"
        inputMode="numeric"
        autoComplete="off"
        required
        maxLength={10}
        defaultValue={values.dni}
        hint="8 dígitos, incluidos los ceros iniciales."
        error={errors?.dni}
      />
      <Field
        id="phone"
        label="Celular"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        required
        defaultValue={values.phone}
        hint="9 dígitos, por ejemplo 987 654 321."
        error={errors?.phone}
      />
    </>
  );
}
