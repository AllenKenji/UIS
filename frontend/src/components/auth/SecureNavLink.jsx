import PropTypes from "prop-types";
import { NavLink } from "react-router-dom";
import { useUser } from "../../context/UserContext";

const SecureNavLink = ({ action, to, children, ...props }) => {
  const { can } = useUser();

  // 🔐 Hide link if user lacks permission
  if (!can(action)) return null;

  return (
    <li>
      <NavLink to={to} {...props}>
        {children}
      </NavLink>
    </li>
  );
};

SecureNavLink.propTypes = {
  action: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export default SecureNavLink;
